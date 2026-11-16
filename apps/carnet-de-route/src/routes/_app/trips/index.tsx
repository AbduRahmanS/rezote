import { createFileRoute } from "@tanstack/react-router";
import { TripList } from "../../../components/home.tsx";

export const Route = createFileRoute("/_app/trips/")({ component: TripList });
