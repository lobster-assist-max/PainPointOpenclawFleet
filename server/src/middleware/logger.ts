import path from "node:path";
import fs from "node:fs";
import pino from "pino";
import { pinoHttp } from "pino-http";
import { readConfigFile } from "../config-file.js";
import { resolveDefaultLogsDir, resolveHomeAwarePath } from "../home-paths.js";
import type { AugmentedResponse } from "./error-handler.js";

function resolveServerLogDir(): string {
  const envOverride = process.env.PAPERCLIP_LOG_DIR?.trim();
  if (envOverride) return resolveHomeAwarePath(envOverride);

  const fileLogDir = readConfigFile()?.logging.logDir?.trim();
  if (fileLogDir) return resolveHomeAwarePath(fileLogDir);

  return resolveDefaultLogsDir();
}

const logDir = resolveServerLogDir();
fs.mkdirSync(logDir, { recursive: true });

const logFile = path.join(logDir, "server.log");

const sharedOpts = {
  translateTime: "HH:MM:ss",
  ignore: "pid,hostname",
  singleLine: true,
};

export const logger = pino({
  level: "debug",
}, pino.transport({
  targets: [
    {
      target: "pino-pretty",
      options: { ...sharedOpts, ignore: "pid,hostname,req,res,responseTime", colorize: true, destination: 1 },
      level: "info",
    },
    {
      target: "pino-pretty",
      options: { ...sharedOpts, colorize: false, destination: logFile, mkdir: true },
      level: "debug",
    },
  ],
}));

export const httpLogger = pinoHttp({
  logger,
  customLogLevel(_req, res, err) {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  customSuccessMessage(req, res) {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },
  customErrorMessage(req, res, err) {
    const augRes = res as unknown as AugmentedResponse;
    const ctx = augRes.__errorContext;
    const errMsg = ctx?.error?.message || err?.message || augRes.err?.message || "unknown error";
    return `${req.method} ${req.url} ${res.statusCode} — ${errMsg}`;
  },
  customProps(req, res) {
    if (res.statusCode >= 400) {
      const augRes = res as unknown as AugmentedResponse;
      const ctx = augRes.__errorContext;
      if (ctx) {
        return {
          errorContext: ctx.error,
          reqBody: ctx.reqBody,
          reqParams: ctx.reqParams,
          reqQuery: ctx.reqQuery,
        };
      }
      const props: Record<string, unknown> = {};
      const expressReq = req as unknown as Record<string, unknown>;
      const { body, params, query } = expressReq;
      if (body && typeof body === "object" && Object.keys(body as Record<string, unknown>).length > 0) {
        props.reqBody = body;
      }
      if (params && typeof params === "object" && Object.keys(params as Record<string, unknown>).length > 0) {
        props.reqParams = params;
      }
      if (query && typeof query === "object" && Object.keys(query as Record<string, unknown>).length > 0) {
        props.reqQuery = query;
      }
      const route = (expressReq as Record<string, unknown>).route as Record<string, unknown> | undefined;
      if (route?.path) {
        props.routePath = route.path;
      }
      return props;
    }
    return {};
  },
});
