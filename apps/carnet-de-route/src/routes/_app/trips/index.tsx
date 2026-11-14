import { createFileRoute } from "@tanstack/react-router";
import { OwnerHome } from "../../../components/home.tsx";

export const Route = createFileRoute("/_app/trips/")({ component: OwnerHome });
