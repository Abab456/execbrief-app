// /src/core/audit/auditExplore.js

module.exports.auditExplore = ({ briefJson }) => {
  const errors = [];

  if (!briefJson.overview) errors.push("Missing overview");
  if (!Array.isArray(briefJson.anomalies)) errors.push("anomalies must be array");
  if (!Array.isArray(briefJson.possible_drivers)) errors.push("possible_drivers must be array");
  if (!Array.isArray(briefJson.data_gaps)) errors.push("data_gaps must be array");
  if (!Array.isArray(briefJson.next_analyses)) errors.push("next_analyses must be array");

  return {
    ok: errors.length === 0,
    errors
  };
};
