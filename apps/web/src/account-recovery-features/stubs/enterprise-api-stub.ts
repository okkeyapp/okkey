/** Core-only stub for `@okkey-enterprise/api` when enterprise repo is absent. */

export class EnterpriseAccountRecoveryClient {
  constructor(_api: unknown) {}

  listDeviceRequests(_role: "owner" | "approver" = "owner") {
    return Promise.resolve({ requests: [] as unknown[] });
  }

  listContactRequests(_role?: string) {
    return Promise.resolve({ requests: [] as unknown[] });
  }

  approveDeviceRequest(..._args: unknown[]) {
    return Promise.reject(new Error("enterprise account recovery is not available"));
  }

  rejectDeviceRequest(..._args: unknown[]) {
    return Promise.reject(new Error("enterprise account recovery is not available"));
  }

  blockDeviceRequest(..._args: unknown[]) {
    return Promise.reject(new Error("enterprise account recovery is not available"));
  }

  releaseContactShare(..._args: unknown[]) {
    return Promise.reject(new Error("enterprise account recovery is not available"));
  }
}

export default { EnterpriseAccountRecoveryClient };
