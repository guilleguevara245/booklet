-- Dos turnos confirmados del mismo profesional no pueden superponerse.
-- El rango va del inicio del turno al fin del margen posterior, semiabierto: un turno
-- puede empezar justo cuando termina el margen del anterior.
-- btree_gist permite combinar la igualdad de staff_id con la superposición de rangos.
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_overlap" EXCLUDE USING gist (
	"staff_id" WITH =,
	tstzrange("starts_at", "blocked_until", '[)') WITH &&
) WHERE ("status" = 'confirmed');
