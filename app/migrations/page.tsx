import { redirect } from "next/navigation";

// Keep older bookmarks working without using a separate migrations URL.
export default function LegacyMigrationsRoute() {
  redirect("/");
}
