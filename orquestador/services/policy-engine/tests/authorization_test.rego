package authorization_test

import data.authorization

test_vigilante_cannot_authorize_engagement {
	result := authorization.allowed_engagement({
		"operator": {"role": "VIGILANTE"},
		"authorization_level": "OPS_OFFICER",
	})
	result == false
}

test_operador_cannot_authorize_oficial_tactico {
	result := authorization.allowed_engagement({
		"operator": {"role": "OPERADOR"},
		"authorization_level": "OFICIAL_TACTICO",
	})
	result == false
}

test_ops_officer_can_authorize_ops_officer {
	result := authorization.allowed_engagement({
		"operator": {"role": "OPS_OFFICER"},
		"authorization_level": "OPS_OFFICER",
	})
	result == true
}

test_oficial_tactico_can_authorize_oficial_tactico {
	result := authorization.allowed_engagement({
		"operator": {"role": "OFICIAL_TACTICO"},
		"authorization_level": "OFICIAL_TACTICO",
	})
	result == true
}

test_jefe_fuego_can_authorize_any_level {
	result := authorization.allowed_engagement({
		"operator": {"role": "JEFE_FUEGO"},
		"authorization_level": "JEFE_FUEGO",
	})
	result == true
}

test_co_maps_to_oficial_tactico {
	result := authorization.allowed_engagement({
		"operator": {"role": "CO"},
		"authorization_level": "OFICIAL_TACTICO",
	})
	result == true
}

test_joint_co_can_authorize_all {
	result := authorization.allowed_engagement({
		"operator": {"role": "JOINT_CO"},
		"authorization_level": "JEFE_FUEGO",
	})
	result == true
}

test_unknown_role_rejected {
	result := authorization.allowed_engagement({
		"operator": {"role": "HACKER"},
		"authorization_level": "OPS_OFFICER",
	})
	result == false
}

test_system_role_bypasses_rank_check {
	result := authorization.allowed_engagement({
		"operator": {"role": "SYSTEM"},
		"authorization_level": "JEFE_FUEGO",
	})
	result == true
}
