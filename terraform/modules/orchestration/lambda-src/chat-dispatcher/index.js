const { SFNClient, StartSyncExecutionCommand } = require("@aws-sdk/client-sfn");

const sfn = new SFNClient({});
const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN;

exports.handler = async (event) => {
  try {
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf-8")
      : (event.body || "{}");

    const result = await sfn.send(new StartSyncExecutionCommand({
      stateMachineArn: STATE_MACHINE_ARN,
      input: rawBody,
    }));

    if (result.status !== "SUCCEEDED") {
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "unavailable", reason: "orchestration_failed" }),
      };
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: result.output,
    };
  } catch (error) {
    console.error("chat-dispatcher error", error);
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "unavailable", reason: "dispatcher_error" }),
    };
  }
};
