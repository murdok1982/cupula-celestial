package cupula.authorization

# ===========================================================================
# Verificación de rol del operador frente al nivel exigido por ROE.
# ===========================================================================
#
# Jerarquía completa (refactor H-CRIT-003). Compatible con los roles legacy:
#
#  VIGILANTE        = 0   (sólo observación)
#  OPERADOR         = 1   (supervisión)
#  OPS_OFFICER      = 2
#  OFICIAL_TACTICO  = 3   (≡ CO en mapping legacy)
#  JEFE_FUEGO       = 4   (≡ JOINT_CO en mapping legacy)

import future.keywords.in
import future.keywords.if

role_rank := {
    "VIGILANTE":       0,
    "ANALYST":         0,
    "AUDIT":           0,
    "ROE_OFFICER":     0,
    "OPERADOR":        1,
    "OPS_OFFICER":     2,
    "OFICIAL_TACTICO": 3,
    "CO":              3,
    "JEFE_FUEGO":      4,
    "JOINT_CO":        4,
    "SYSTEM":          4,
}

required_rank := {
    "OPS_OFFICER":     2,
    "OFICIAL_TACTICO": 3,
    "CO":              3,
    "JEFE_FUEGO":      4,
    "JOINT_CO":        4,
}

default authorized := false

authorized if {
    op := role_rank[input.operator.role]
    req := required_rank[input.required_level]
    op >= req
    input.mfa_satisfied == true
}

reason := "OK" if { authorized }

reason := "MFA no satisfecho" if {
    input.mfa_satisfied == false
}

reason := msg if {
    not authorized
    not input.mfa_satisfied == false
    op := object.get(role_rank, input.operator.role, -1)
    req := object.get(required_rank, input.required_level, 999)
    msg := sprintf("rol %s (rank=%d) insuficiente para %s (rank=%d)", [input.operator.role, op, input.required_level, req])
}
