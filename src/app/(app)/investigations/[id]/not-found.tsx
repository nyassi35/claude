import { EmptyState, LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <EmptyState title="Investigation not found" action={<LinkButton href="/investigations">Back to investigations</LinkButton>}>
      It may have been deleted, or it belongs to an organization you do not have access to.
    </EmptyState>
  );
}
