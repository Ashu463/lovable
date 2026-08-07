import { useState } from "react";
import { useNavigate } from "react-router-dom";

// Navigates straight to the workspace using the run id the list already has.
// Booting the sandbox takes tens of seconds, so doing it before navigating left
// the card sitting on "Starting sandbox…" — the workspace spawns it instead and
// renders its own loading state while that happens.
export function useOpenProject() {
  const navigate = useNavigate();
  const [openError, setOpenError] = useState<string | null>(null);

  const openProject = (project: { id: string; latestRunId?: string | null }) => {
    if (!project.latestRunId) {
      setOpenError("This project doesn't have a build yet.");
      return;
    }
    setOpenError(null);
    navigate(`/w/${project.latestRunId}`);
  };

  // openingId stays in the API so the lists can keep their pending styling; it
  // is always null now that navigation is immediate.
  return { openProject, openingId: null as string | null, openError };
}
