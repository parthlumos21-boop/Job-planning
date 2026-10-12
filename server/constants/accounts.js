const ALL_DEPARTMENTS = ["marketing", "design", "purchase", "mechanical", "production", "dispatch"];

const DEFAULT_ACCOUNTS = [
  { username: "kevalvshah", password: "kevalvshah", role: "admin", departments: ALL_DEPARTMENTS },
  { username: "keval", password: "keval", role: "admin", departments: ALL_DEPARTMENTS },
  { username: "keval v shah", password: "keval@123", role: "executive", departments: ALL_DEPARTMENTS },
  { username: "admin", password: "admin", role: "admin", departments: ALL_DEPARTMENTS },
  { username: "admin2", password: "admin2", role: "admin", departments: ALL_DEPARTMENTS },

  { username: "swatisales", password: "swatisales", role: "user", departments: ["marketing"] },
  { username: "swatisales2", password: "swatisales2", role: "user", departments: ["marketing"] },
  { username: "mktadmin", password: "mktadmin", role: "user", departments: ["marketing"] },

  { username: "swatidesign", password: "swatidesign", role: "user", departments: ["design"] },
  { username: "swatidesign2", password: "swatidesign2", role: "user", departments: ["design"] },
  { username: "designadmin", password: "designadmin", role: "user", departments: ["design"] },

  { username: "mechdesign1", password: "mechdesign1", role: "user", departments: ["mechanical"] },
  { username: "mechdesign2", password: "mechdesign2", role: "user", departments: ["mechanical"] },
  { username: "machinedesign", password: "machinedesign", role: "user", departments: ["mechanical"] },

  { username: "swatipurchase", password: "swatipurchase", role: "user", departments: ["purchase"] },
  { username: "swatipurchase2", password: "swatipurchase2", role: "user", departments: ["purchase"] },
  { username: "purchaseadmin", password: "purchaseadmin", role: "user", departments: ["purchase"] },

  { username: "swatiproduction", password: "swatiproduction", role: "user", departments: ["production", "dispatch"] },
  { username: "swatiqc", password: "swatiqc", role: "user", departments: ["production", "dispatch"] },
  { username: "prodadmin", password: "prodadmin", role: "user", departments: ["production", "dispatch"] },
];

module.exports = {
  ALL_DEPARTMENTS,
  DEFAULT_ACCOUNTS,
};
