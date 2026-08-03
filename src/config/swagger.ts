import path from "path";
import { Express } from "express";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";

export function setupSwagger(app: Express) {
  const specPath = path.join(process.cwd(), "docs", "openapi.yaml");
  const swaggerDocument = YAML.load(specPath);

  app.get("/api-docs.json", (_req, res) => {
    res.json(swaggerDocument);
  });

  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerDocument, {
      customSiteTitle: "Electronics Cart API Docs",
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: "none",
        filter: true,
        tagsSorter: "alpha",
        operationsSorter: "alpha",
      },
    })
  );
}
