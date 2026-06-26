# Server-owned route calculation for route modes

TREK will calculate mixed day-plan route segments on the server when route modes are involved, instead of letting the client directly orchestrate provider calls. This centralizes route-mode precedence, provider selection, waterway speed defaults, structured segment responses, and approximate-route fallback semantics while keeping the client focused on rendering geometry and labels.
