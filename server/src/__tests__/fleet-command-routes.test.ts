import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { fleetCommandRoutes } from "../routes/fleet-command.js";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/fleet-command", fleetCommandRoutes());
  return app;
}

describe("fleet-command routes", () => {
  it("GET /templates returns full built-in templates (icon, tags, steps)", async () => {
    const res = await request(makeApp()).get("/fleet-command/templates");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.templates)).toBe(true);
    expect(res.body.templates.length).toBeGreaterThan(0);
    const tpl = res.body.templates[0];
    // The UI reads tpl.icon, tpl.steps.length and tpl.tags.slice — all must exist.
    expect(typeof tpl.icon).toBe("string");
    expect(Array.isArray(tpl.tags)).toBe(true);
    expect(Array.isArray(tpl.steps)).toBe(true);
    expect(typeof tpl.steps[0].type).toBe("string");
    expect(typeof tpl.steps[0].label).toBe("string");
  });

  it("POST /pipelines/execute returns a pipelineId and the pipeline advances to completed on polling", async () => {
    const app = makeApp();
    const exec = await request(app)
      .post("/fleet-command/pipelines/execute")
      .send({
        name: "Smoke pipeline",
        targetBotIds: ["bot-1", "bot-2"],
        steps: [
          { type: "health_gate", label: "Pre-flight", config: { healthThreshold: 70 } },
          { type: "notification", label: "Notify", config: { notificationMessage: "hi" } },
        ],
      });
    expect(exec.status).toBe(201);
    expect(exec.body.ok).toBe(true);
    expect(typeof exec.body.pipelineId).toBe("string");
    const id = exec.body.pipelineId;

    // First poll: pipeline is running, first step running.
    const first = await request(app).get(`/fleet-command/pipelines/${id}`);
    expect(first.status).toBe(200);
    expect(first.body.pipeline.status).toBe("running");
    expect(first.body.pipeline.steps[0].status).toBe("running");

    // Poll until terminal (lazy advancement: one step per poll).
    let pipeline = first.body.pipeline;
    for (let i = 0; i < 6 && pipeline.status === "running"; i++) {
      const poll = await request(app).get(`/fleet-command/pipelines/${id}`);
      pipeline = poll.body.pipeline;
    }
    expect(pipeline.status).toBe("completed");
    expect(pipeline.steps.every((s: { status: string }) => s.status === "succeeded")).toBe(true);
    expect(pipeline.log.length).toBeGreaterThan(0);
  });

  it("POST /pipelines/execute rejects missing/empty fields with 400", async () => {
    const app = makeApp();
    const noBots = await request(app)
      .post("/fleet-command/pipelines/execute")
      .send({ name: "X", targetBotIds: [], steps: [{ type: "delay", label: "d", config: {} }] });
    expect(noBots.status).toBe(400);

    const badStepType = await request(app)
      .post("/fleet-command/pipelines/execute")
      .send({ name: "X", targetBotIds: ["b"], steps: [{ type: "nope", label: "d", config: {} }] });
    expect(badStepType.status).toBe(400);

    const noSteps = await request(app)
      .post("/fleet-command/pipelines/execute")
      .send({ name: "X", targetBotIds: ["b"] });
    expect(noSteps.status).toBe(400);
  });

  it("pause then abort transitions a running pipeline", async () => {
    const app = makeApp();
    const exec = await request(app)
      .post("/fleet-command/pipelines/execute")
      .send({
        name: "Pausable",
        targetBotIds: ["b"],
        steps: [
          { type: "delay", label: "d1", config: { delaySeconds: 1 } },
          { type: "delay", label: "d2", config: { delaySeconds: 1 } },
        ],
      });
    const id = exec.body.pipelineId;

    const pause = await request(app).post(`/fleet-command/pipelines/${id}/pause`);
    expect(pause.status).toBe(200);
    expect(pause.body.ok).toBe(true);

    // Cannot pause again once paused.
    const pauseAgain = await request(app).post(`/fleet-command/pipelines/${id}/pause`);
    expect(pauseAgain.status).toBe(409);

    const abort = await request(app).post(`/fleet-command/pipelines/${id}/abort`);
    expect(abort.status).toBe(200);
    const status = await request(app).get(`/fleet-command/pipelines/${id}`);
    expect(status.body.pipeline.status).toBe("aborted");
  });

  it("POST /templates saves a custom template usable by execute (templateId)", async () => {
    const app = makeApp();
    const save = await request(app)
      .post("/fleet-command/templates")
      .send({
        name: "My Template",
        description: "custom",
        steps: [{ type: "notification", label: "ping", config: { notificationMessage: "yo" } }],
      });
    expect(save.status).toBe(201);
    expect(save.body.template.icon).toBeTruthy();
    expect(Array.isArray(save.body.template.tags)).toBe(true);
    const templateId = save.body.template.id;

    const exec = await request(app)
      .post("/fleet-command/pipelines/execute")
      .send({ name: "From template", targetBotIds: ["b"], templateId });
    expect(exec.status).toBe(201);
    expect(typeof exec.body.pipelineId).toBe("string");
  });

  it("returns 404 for unknown pipeline id", async () => {
    const res = await request(makeApp()).get("/fleet-command/pipelines/does-not-exist");
    expect(res.status).toBe(404);
  });
});
