// Lambda de transformación: DynamoDB Streams (case_store) -> Kinesis
// Firehose (Direct PUT). Puro glue/infra, sin lógica de negocio -- mismo
// criterio que terraform/modules/orchestration/lambda-src/chat-dispatcher:
// JS plano, sin esbuild, usando SOLO el SDK v3 preinstalado en el runtime
// Node.js 20.x de Lambda (@aws-sdk/client-firehose).
//
// Por qué existe este Lambda: Kinesis Firehose NO tiene un origen nativo de
// "DynamoDB Streams" (a diferencia de Kinesis Data Streams, que sí puede
// ser origen directo de Firehose) -- hace falta un consumidor intermedio
// que lea el stream vía event source mapping y haga PutRecordBatch hacia
// Firehose (Direct PUT como source).
//
// Formato exacto de los datos que llegan a Firehose (y de ahí a S3, ver
// README.md de este módulo para el detalle completo):
//   - Un objeto JSON por record de DynamoDB Streams, SIN aplanar -- se deja
//     el formato DynamoDB JSON tal cual (Keys/NewImage/OldImage con sus
//     wrappers de tipo, ej. {"S": "CASE#123"}), porque aplanarlo perdería
//     información de tipo sin un mapeo de negocio que no es responsabilidad
//     de este Lambda (puro glue de infra).
//   - Cada objeto se serializa con JSON.stringify + "\n" (newline-delimited
//     JSON / NDJSON) antes de mandarlo a Firehose -- Firehose NO agrega
//     delimitadores automáticamente en modo Direct PUT, así que si este
//     Lambda no lo hace, los objetos quedarían concatenados sin separador
//     en el archivo final de S3.
const { FirehoseClient, PutRecordBatchCommand } = require("@aws-sdk/client-firehose");

const firehose = new FirehoseClient({});
const DELIVERY_STREAM_NAME = process.env.FIREHOSE_DELIVERY_STREAM_NAME;

// Límite real de Firehose PutRecordBatch: máximo 500 records por llamada.
const MAX_BATCH_SIZE = 500;

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function toFirehoseRecord(streamRecord) {
  const payload = {
    eventId: streamRecord.eventID,
    eventName: streamRecord.eventName, // INSERT | MODIFY | REMOVE
    eventSourceArn: streamRecord.eventSourceARN,
    approximateCreationDateTime: streamRecord.dynamodb && streamRecord.dynamodb.ApproximateCreationDateTime
      ? new Date(streamRecord.dynamodb.ApproximateCreationDateTime * 1000).toISOString()
      : null,
    keys: (streamRecord.dynamodb && streamRecord.dynamodb.Keys) || null,
    newImage: (streamRecord.dynamodb && streamRecord.dynamodb.NewImage) || null,
    oldImage: (streamRecord.dynamodb && streamRecord.dynamodb.OldImage) || null,
  };

  return { Data: Buffer.from(JSON.stringify(payload) + "\n", "utf-8") };
}

exports.handler = async (event) => {
  const records = (event.Records || []).map(toFirehoseRecord);

  if (records.length === 0) {
    return { batchItemFailures: [] };
  }

  for (const batch of chunk(records, MAX_BATCH_SIZE)) {
    const result = await firehose.send(new PutRecordBatchCommand({
      DeliveryStreamName: DELIVERY_STREAM_NAME,
      Records: batch,
    }));

    if (result.FailedPutCount && result.FailedPutCount > 0) {
      // Sin partial batch item failure reporting hacia el event source
      // mapping de DynamoDB Streams en este checkpoint (ver README.md,
      // limitación conocida) -- cualquier fallo hace fallar TODA la
      // invocación, así que el event source mapping reintenta el batch
      // completo (bisect_batch_on_function_error = true en el
      // aws_lambda_event_source_mapping, hasta maximum_retry_attempts).
      throw new Error(
        `Firehose PutRecordBatch: ${result.FailedPutCount} de ${batch.length} records fallaron`
      );
    }
  }

  return { batchItemFailures: [] };
};
