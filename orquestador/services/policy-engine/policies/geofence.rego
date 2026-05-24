package cupula.geofence

# Determina si una posición (lat, lon, altitude_agl_m) cae dentro de alguna
# zona protegida del catálogo `data.geofences`.
# Implementación PoC: cajas axis-aligned (min_lat/max_lat/min_lon/max_lon).
# En producción: PostGIS + tile precomputado.

import future.keywords.in

default in_protected_zone := false
default protected_zones := []

in_protected_zone {
    some fence in data.geofences.zones
    fence.active == true
    point_in_box(input.position, fence.bbox)
    altitude_in_range(input.position.altitude_agl_m, fence)
}

protected_zones := pz {
    pz := [name |
        some fence in data.geofences.zones
        fence.active == true
        point_in_box(input.position, fence.bbox)
        altitude_in_range(input.position.altitude_agl_m, fence)
        name := fence.name
    ]
}

point_in_box(pos, bbox) {
    pos.lat >= bbox.min_lat
    pos.lat <= bbox.max_lat
    pos.lon >= bbox.min_lon
    pos.lon <= bbox.max_lon
}

altitude_in_range(alt, fence) {
    alt >= fence.altitude_min_m
    alt <= fence.altitude_max_m
}

# Hospitales y escuelas requieren tag específico
sensitive_zone[name] {
    some fence in data.geofences.zones
    fence.fence_type == "HOSPITAL"
    point_in_box(input.position, fence.bbox)
    name := fence.name
}

sensitive_zone[name] {
    some fence in data.geofences.zones
    fence.fence_type == "SCHOOL"
    point_in_box(input.position, fence.bbox)
    name := fence.name
}

sensitive_zone[name] {
    some fence in data.geofences.zones
    fence.fence_type == "EMBASSY"
    point_in_box(input.position, fence.bbox)
    name := fence.name
}
