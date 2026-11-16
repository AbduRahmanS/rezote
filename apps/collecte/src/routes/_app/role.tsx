import { createFileRoute } from "@tanstack/react-router";
import { RolePicker } from "../../components/setup.tsx";

export const Route = createFileRoute("/_app/role")({ component: RolePicker });
