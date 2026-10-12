function userDepartments(user) {
  return Array.isArray(user?.departments) ? user.departments : [];
}

function isMarketing(user) {
  return user?.role === "user" && userDepartments(user).includes("marketing");
}

function isKeval(user) {
  return String(user?.username || "").trim().toLowerCase() === "keval v shah";
}

function canManageJobCore(user) {
  return user?.role === "admin" || user?.role === "executive" || isKeval(user) || user?.username === "designadmin" || userDepartments(user).includes("marketing");
}

function visibleDepartmentsForJob(job) {
  const visible = new Set();

  if (job?.targetDepartment) visible.add(job.targetDepartment);
  if (Array.isArray(job?.visibleToDepartments)) {
    job.visibleToDepartments.forEach((d) => d && visible.add(d));
  }

  Object.entries(job?.fields || {}).forEach(([dept, fields]) => {
    if (fields && Object.keys(fields).length > 0) visible.add(dept);
  });

  Object.entries(job?.engineers || {}).forEach(([dept, names]) => {
    if (Array.isArray(names) && names.length > 0) visible.add(dept);
  });

  return Array.from(visible);
}

function canViewJob(user, job, department) {
  if (isKeval(user)) return true;
  if (user?.role === "admin" || user?.role === "executive") return true;

  const allowed = userDepartments(user);
  if (department && !allowed.includes(department)) return false;

  const visible = visibleDepartmentsForJob(job);
  if (department) return visible.includes(department);
  return allowed.some((dept) => visible.includes(dept));
}

module.exports = {
  canManageJobCore,
  canViewJob,
  isKeval,
  isMarketing,
  userDepartments,
  visibleDepartmentsForJob,
};
