from datetime import date, timedelta
from typing import Any
import operator

# Standard Holiday Set for Indian Manufacturing (fallback if calendar table empty)
DEFAULT_INDIAN_HOLIDAYS_2026 = {
    date(2026, 1, 26),  # Republic Day
    date(2026, 3, 4),   # Holi / Dhuleti
    date(2026, 8, 15),  # Independence Day
    date(2026, 10, 2),  # Gandhi Jayanti
    date(2026, 10, 20), # Dussehra
    date(2026, 11, 8),  # Diwali
    date(2026, 11, 9),  # New Year / Vikram Samvat
    date(2026, 12, 25), # Christmas
}

def is_working_day(target_date: date, holidays: set[date] | None = None, include_saturdays: bool = True) -> bool:
    """
    Checks if a given date is a working day.
    Sundays are always non-working.
    Saturdays are working by default in factory switchgear manufacturing, unless specified.
    """
    if target_date.weekday() == 6:  # Sunday
        return False
    if not include_saturdays and target_date.weekday() == 5: # Saturday
        return False
    
    active_holidays = holidays if holidays is not None else DEFAULT_INDIAN_HOLIDAYS_2026
    if target_date in active_holidays:
        return False
    
    return True

def add_working_days(start: date, days: int, holidays: set[date] | None = None) -> date:
    """
    Adds N working days to start date, skipping non-working days.
    If days == 1 and start is a working day, completion is same day or next working day.
    Following industrial planning convention: duration of 1 day finishes on same day if started in morning,
    or next working day. Here we define duration N as N elapsed working days.
    """
    if days <= 0:
        return start

    cur = start
    # If start is a holiday, advance to next working day first
    while not is_working_day(cur, holidays):
        cur += timedelta(days=1)

    added = 0
    # The first day is day 1 (working day 1)
    while added < (days - 1):
        cur += timedelta(days=1)
        if is_working_day(cur, holidays):
            added += 1

    return cur

def diff_working_days(start: date, end: date, holidays: set[date] | None = None) -> int:
    """
    Returns signed working days between two dates.
    Positive if end > start, negative if start > end, 0 if same.
    """
    if start == end:
        return 0

    is_negative = end < start
    d_start, d_end = (end, start) if is_negative else (start, end)

    cur = d_start + timedelta(days=1)
    count = 0
    while cur <= d_end:
        if is_working_day(cur, holidays):
            count += 1
        cur += timedelta(days=1)

    return -count if is_negative else count

def match_condition(param_value: Any, op: str, rule_value: Any) -> bool:
    """
    Evaluates whether a condition modifier matches job parameters.
    """
    if param_value is None:
        return False

    op_norm = op.lower().strip()
    try:
        if op_norm in ["equals", "==", "eq"]:
            if isinstance(param_value, str) and isinstance(rule_value, str):
                return param_value.strip().lower() == rule_value.strip().lower()
            return param_value == rule_value
        
        elif op_norm in ["!=", "ne", "notequals"]:
            if isinstance(param_value, str) and isinstance(rule_value, str):
                return param_value.strip().lower() != rule_value.strip().lower()
            return param_value != rule_value

        elif op_norm in ["in", "includes"]:
            if isinstance(rule_value, list):
                if isinstance(param_value, str):
                    return any(param_value.strip().lower() == str(v).strip().lower() for v in rule_value)
                return param_value in rule_value
            elif isinstance(rule_value, str) and isinstance(param_value, str):
                return rule_value.lower() in param_value.lower()
            return False

        elif op_norm in [">", "gt"]:
            return float(param_value) > float(rule_value)

        elif op_norm in [">=", "gte"]:
            return float(param_value) >= float(rule_value)

        elif op_norm in ["<", "lt"]:
            return float(param_value) < float(rule_value)

        elif op_norm in ["<=", "lte"]:
            return float(param_value) <= float(rule_value)

        elif op_norm in ["contains"]:
            return str(rule_value).lower() in str(param_value).lower()

    except Exception:
        return False

    return False

def evaluate_department_formula(
    base_days: int,
    condition_modifiers: list[dict],
    multiplier: float,
    job_params: dict[str, Any]
) -> tuple[int, list[dict]]:
    """
    Calculates duration in working days for a department given job parameters.
    Returns (total_working_days, applied_modifiers_list)
    """
    applied_modifiers = []
    total_days = float(base_days)

    for cond in condition_modifiers:
        field = cond.get("field")
        op = cond.get("operator", "equals")
        val = cond.get("value")
        add_days = cond.get("additionalDays", 0)
        label = cond.get("label", f"{field} {op} {val}")

        param_val = job_params.get(field)
        if match_condition(param_val, op, val):
            total_days += float(add_days)
            applied_modifiers.append({
                "field": field,
                "label": label,
                "additionalDays": add_days,
                "matchedValue": param_val
            })

    total_days = total_days * float(multiplier or 1.0)
    final_days = max(1, round(total_days))
    return final_days, applied_modifiers

def compute_master_timeline(
    job_created_date: date,
    department_rules: dict[str, dict],
    job_params: dict[str, Any],
    holidays: set[date] | None = None
) -> dict[str, Any]:
    """
    Generates a full schedule across all 7 departments with parallel fork-join support:
    Marketing -> [Electrical || Mechanical] -> Procurement -> Production -> QC -> Dispatch.
    """
    schedule = {}
    
    # 1. Marketing
    mkt_rule = department_rules.get("marketing", {"base_days": 2, "condition_modifiers": [], "multiplier": 1.0})
    mkt_days, mkt_mods = evaluate_department_formula(
        mkt_rule.get("base_days", 2),
        mkt_rule.get("condition_modifiers", []),
        mkt_rule.get("multiplier", 1.0),
        job_params
    )
    mkt_start = job_created_date
    mkt_end = add_working_days(mkt_start, mkt_days, holidays)
    schedule["marketing"] = {
        "department": "marketing",
        "displayName": "Marketing",
        "planned_start": mkt_start,
        "planned_end": mkt_end,
        "duration_days": mkt_days,
        "applied_modifiers": mkt_mods,
        "dependencies": []
    }

    # Next working day after marketing completion
    design_start = add_working_days(mkt_end, 2, holidays) if is_working_day(mkt_end, holidays) else mkt_end

    # 2. Electrical Design (Parallel Branch A)
    elec_rule = department_rules.get("design", {"base_days": 3, "condition_modifiers": [], "multiplier": 1.0})
    elec_days, elec_mods = evaluate_department_formula(
        elec_rule.get("base_days", 3),
        elec_rule.get("condition_modifiers", []),
        elec_rule.get("multiplier", 1.0),
        job_params
    )
    elec_start = design_start
    elec_end = add_working_days(elec_start, elec_days, holidays)
    schedule["design"] = {
        "department": "design",
        "displayName": "Electrical Design",
        "planned_start": elec_start,
        "planned_end": elec_end,
        "duration_days": elec_days,
        "applied_modifiers": elec_mods,
        "dependencies": ["marketing"]
    }

    # 3. Mechanical Design (Parallel Branch B)
    mech_rule = department_rules.get("mechanical", {"base_days": 3, "condition_modifiers": [], "multiplier": 1.0})
    mech_days, mech_mods = evaluate_department_formula(
        mech_rule.get("base_days", 3),
        mech_rule.get("condition_modifiers", []),
        mech_rule.get("multiplier", 1.0),
        job_params
    )
    mech_start = design_start
    mech_end = add_working_days(mech_start, mech_days, holidays)
    schedule["mechanical"] = {
        "department": "mechanical",
        "displayName": "Mechanical Design",
        "planned_start": mech_start,
        "planned_end": mech_end,
        "duration_days": mech_days,
        "applied_modifiers": mech_mods,
        "dependencies": ["marketing"]
    }

    # 4. Procurement (Join: Starts after MAX of Electrical & Mechanical)
    design_max_end = max(elec_end, mech_end)
    purchase_start = add_working_days(design_max_end, 2, holidays)
    purchase_rule = department_rules.get("purchase", {"base_days": 5, "condition_modifiers": [], "multiplier": 1.0})
    purchase_days, purchase_mods = evaluate_department_formula(
        purchase_rule.get("base_days", 5),
        purchase_rule.get("condition_modifiers", []),
        purchase_rule.get("multiplier", 1.0),
        job_params
    )
    purchase_end = add_working_days(purchase_start, purchase_days, holidays)
    schedule["purchase"] = {
        "department": "purchase",
        "displayName": "Procurement / Purchase",
        "planned_start": purchase_start,
        "planned_end": purchase_end,
        "duration_days": purchase_days,
        "applied_modifiers": purchase_mods,
        "dependencies": ["design", "mechanical"]
    }

    # 5. Production
    prod_start = add_working_days(purchase_end, 2, holidays)
    prod_rule = department_rules.get("production", {"base_days": 7, "condition_modifiers": [], "multiplier": 1.0})
    prod_days, prod_mods = evaluate_department_formula(
        prod_rule.get("base_days", 7),
        prod_rule.get("condition_modifiers", []),
        prod_rule.get("multiplier", 1.0),
        job_params
    )
    prod_end = add_working_days(prod_start, prod_days, holidays)
    schedule["production"] = {
        "department": "production",
        "displayName": "Production",
        "planned_start": prod_start,
        "planned_end": prod_end,
        "duration_days": prod_days,
        "applied_modifiers": prod_mods,
        "dependencies": ["purchase"]
    }

    # 6. Quality Control (QC)
    qc_start = add_working_days(prod_end, 2, holidays)
    qc_rule = department_rules.get("qc", {"base_days": 2, "condition_modifiers": [], "multiplier": 1.0})
    qc_days, qc_mods = evaluate_department_formula(
        qc_rule.get("base_days", 2),
        qc_rule.get("condition_modifiers", []),
        qc_rule.get("multiplier", 1.0),
        job_params
    )
    qc_end = add_working_days(qc_start, qc_days, holidays)
    schedule["qc"] = {
        "department": "qc",
        "displayName": "Quality Control (QC)",
        "planned_start": qc_start,
        "planned_end": qc_end,
        "duration_days": qc_days,
        "applied_modifiers": qc_mods,
        "dependencies": ["production"]
    }

    # 7. Dispatch
    dispatch_start = add_working_days(qc_end, 2, holidays)
    dispatch_rule = department_rules.get("dispatch", {"base_days": 1, "condition_modifiers": [], "multiplier": 1.0})
    dispatch_days, dispatch_mods = evaluate_department_formula(
        dispatch_rule.get("base_days", 1),
        dispatch_rule.get("condition_modifiers", []),
        dispatch_rule.get("multiplier", 1.0),
        job_params
    )
    dispatch_end = add_working_days(dispatch_start, dispatch_days, holidays)
    schedule["dispatch"] = {
        "department": "dispatch",
        "displayName": "Dispatch",
        "planned_start": dispatch_start,
        "planned_end": dispatch_end,
        "duration_days": dispatch_days,
        "applied_modifiers": dispatch_mods,
        "dependencies": ["qc"]
    }

    total_span_working_days = diff_working_days(mkt_start, dispatch_end, holidays) + 1

    return {
        "job_created_date": job_created_date,
        "projected_dispatch_date": dispatch_end,
        "total_working_days": total_span_working_days,
        "departments": schedule
    }
