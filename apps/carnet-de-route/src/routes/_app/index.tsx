import { createFileRoute } from "@tanstack/react-router";
import { DriverHome, OwnerHome } from "../../components/home.tsx";
import { useRole } from "../../runtime.ts";

export const Route = createFileRoute("/_app/")({ component: Home });

function Home() {
  return useRole() === "driver" ? <DriverHome /> : <OwnerHome />;
}
