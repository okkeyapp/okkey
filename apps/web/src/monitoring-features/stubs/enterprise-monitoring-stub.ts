import type { PasswordMonitoringModule } from "../registry";

function useMonitoringIssueItemIds(): undefined {
  return undefined;
}

/** Open-core stub: no screen, no path, no list filtering. */
const passwordMonitoringModule: PasswordMonitoringModule = {
  MonitoringPage: null,
  monitoringPath: null,
  useMonitoringIssueItemIds,
};

export default passwordMonitoringModule;
