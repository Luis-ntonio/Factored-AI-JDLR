#!/usr/bin/env node
/**
 * Sube `apps/web/dist/` (build de Vite, ya generado por `npm run build`) al
 * bucket S3 real (`banking-agent-dev-frontend`) e invalida CloudFront --
 * primer deploy real del frontend a la infraestructura ya provisionada
 * (hasta ahora solo se había verificado con `npm run dev` local, nunca
 * contra la URL pública -- ver docs/STATUS.md).
 *
 * NUNCA hardcodea el bucket/distribution ID -- los lee de los outputs
 * reales de Terraform (`terraform output -json`, mismo mecanismo que
 * cualquier operador humano usaría) para no arriesgar un typo que suba
 * contenido al lugar equivocado.
 *
 * Uso: node apps/web/scripts/deploy.mjs (desde la raíz del repo, con
 * AWS_PROFILE=banking-agent-dev y apps/web/dist/ ya buildeado).
 */
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { CloudFrontClient, CreateInvalidationCommand } from "@aws-sdk/client-cloudfront";

const REPO_ROOT = new URL("../../../", import.meta.url).pathname.replace(/^\/([a-zA-Z]):/, "$1:");
const DIST_DIR = join(REPO_ROOT, "apps", "web", "dist");

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function terraformOutputs() {
  const raw = execSync("terraform output -json", {
    cwd: join(REPO_ROOT, "terraform", "envs", "dev"),
    encoding: "utf-8",
  });
  return JSON.parse(raw);
}

async function main() {
  const outputs = terraformOutputs();
  const bucket = outputs.frontend_bucket_name.value;
  const distributionId = outputs.frontend_cloudfront_distribution_id.value;
  const domain = outputs.frontend_cloudfront_domain_name.value;

  const s3 = new S3Client({});
  const cloudfront = new CloudFrontClient({});

  const files = walk(DIST_DIR);
  console.log(`Subiendo ${files.length} archivo(s) de ${DIST_DIR} a s3://${bucket} ...`);

  for (const file of files) {
    const key = relative(DIST_DIR, file).replace(/\\/g, "/");
    const contentType = CONTENT_TYPES[extname(file)] ?? "application/octet-stream";
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: readFileSync(file),
        ContentType: contentType,
        // index.html nunca debe quedar cacheado agresivamente -- referencia
        // a los assets con hash (esos sí, cache larga) via <script>/<link>
        // que Vite ya versiona por contenido.
        CacheControl: key === "index.html" ? "no-cache" : "public, max-age=31536000, immutable",
      })
    );
    console.log(`  ${key} (${contentType})`);
  }

  console.log(`Invalidando CloudFront (${distributionId}) ...`);
  await cloudfront.send(
    new CreateInvalidationCommand({
      DistributionId: distributionId,
      InvalidationBatch: {
        CallerReference: `deploy-${Date.now()}`,
        Paths: { Quantity: 1, Items: ["/*"] },
      },
    })
  );

  console.log(`Listo. https://${domain}`);
}

main().catch((err) => {
  console.error("deploy.mjs falló", err);
  process.exitCode = 1;
});
