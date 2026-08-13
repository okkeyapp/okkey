import { createHash, createHmac } from "node:crypto";

import { EmailTemplateError } from "./errors.ts";
import type { EmailMessage, EmailSender } from "./service.ts";

export type SesEmailSenderOptions = {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Origin or full URL; path defaults to SES v2 SendEmail. */
  endpoint?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

const SES_SERVICE = "ses";
const SES_SEND_PATH = "/v2/email/outbound-emails";

export function defaultSesEndpoint(region: string): string {
  return `https://email.${region}.amazonaws.com`;
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function amzDateParts(now: Date): { amzDate: string; dateStamp: string } {
  const iso = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

function signingKey(secret: string, dateStamp: string, region: string): Buffer {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, SES_SERVICE);
  return hmac(kService, "aws4_request");
}

export function resolveSesRequestUrl(endpoint: string): URL {
  const trimmed = endpoint.trim().replace(/\/$/, "");
  const withScheme = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
  const url = new URL(withScheme);
  if (url.pathname === "/" || url.pathname === "") {
    url.pathname = SES_SEND_PATH;
  }
  return url;
}

export function signSesV2Post(input: {
  url: URL;
  body: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  now?: Date;
}): { authorization: string; amzDate: string; contentSha256: string; host: string } {
  const now = input.now ?? new Date();
  const { amzDate, dateStamp } = amzDateParts(now);
  const contentSha256 = sha256Hex(input.body);
  const host = input.url.host;
  const canonicalHeaders =
    `content-type:application/json\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:${contentSha256}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    "POST",
    input.url.pathname,
    input.url.search.replace(/^\?/, ""),
    canonicalHeaders,
    signedHeaders,
    contentSha256,
  ].join("\n");
  const credentialScope = `${dateStamp}/${input.region}/${SES_SERVICE}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = hmac(
    signingKey(input.secretAccessKey, dateStamp, input.region),
    stringToSign,
  ).toString("hex");
  const authorization =
    `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { authorization, amzDate, contentSha256, host };
}

export class SesEmailSender implements EmailSender {
  private readonly region: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly url: URL;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: SesEmailSenderOptions) {
    this.region = options.region.trim();
    this.accessKeyId = options.accessKeyId;
    this.secretAccessKey = options.secretAccessKey;
    this.url = resolveSesRequestUrl(options.endpoint?.trim() || defaultSesEndpoint(this.region));
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async send(message: EmailMessage): Promise<void> {
    const body = JSON.stringify({
      FromEmailAddress: message.from,
      Destination: { ToAddresses: [message.to] },
      Content: {
        Simple: {
          Subject: { Data: message.subject, Charset: "UTF-8" },
          Body: {
            Text: { Data: message.text, Charset: "UTF-8" },
            Html: { Data: message.html, Charset: "UTF-8" },
          },
        },
      },
    });
    const signed = signSesV2Post({
      url: this.url,
      body,
      region: this.region,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);
    try {
      const response = await this.fetchImpl(this.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Host: signed.host,
          "X-Amz-Date": signed.amzDate,
          "X-Amz-Content-Sha256": signed.contentSha256,
          Authorization: signed.authorization,
        },
        body,
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new EmailTemplateError(
          "EMAIL_TRANSPORT_ERROR",
          `ses send failed: status ${response.status}`,
          { status: response.status, body: detail.slice(0, 500) },
        );
      }
    } catch (cause) {
      if (cause instanceof EmailTemplateError) {
        throw cause;
      }
      throw new EmailTemplateError(
        "EMAIL_TRANSPORT_ERROR",
        cause instanceof Error ? cause.message : "ses send failed",
        { cause: cause instanceof Error ? cause.message : String(cause) },
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
