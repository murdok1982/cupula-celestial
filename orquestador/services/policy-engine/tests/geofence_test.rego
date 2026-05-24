package cupula.geofence_test

import data.cupula.geofence

test_point_inside_protected_zone {
    result := geofence.in_protected_zone({
        "latitude": 40.420,
        "longitude": -3.710,
    })
    result == true
}

test_point_outside_protected_zone {
    result := geofence.in_protected_zone({
        "latitude": 42.000,
        "longitude": -5.000,
    })
    result == false
}

test_military_zone_identified {
    result := geofence.zone_type({
        "latitude": 40.430,
        "longitude": -3.720,
    })
    result == "MILITARY"
}

test_hospital_zone_identified {
    result := geofence.zone_type({
        "latitude": 40.420,
        "longitude": -3.710,
    })
    result == "HOSPITAL"
}

test_school_zone_identified {
    result := geofence.zone_type({
        "latitude": 40.425,
        "longitude": -3.715,
    })
    result == "SCHOOL"
}

test_safe_zone_outside_all_geofences {
    result := geofence.zone_type({
        "latitude": 50.000,
        "longitude": 10.000,
    })
    result == "SAFE"
}
