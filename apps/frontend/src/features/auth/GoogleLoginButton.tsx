import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "@/lib/auth";

export function GoogleLoginButton({
  onSuccess,
  onError,
}: {
  onSuccess?: () => void;
  onError?: (message: string) => void;
}) {
  const { signInWithGoogle } = useAuth();

  return (
    <GoogleLogin
      theme="filled_black"
      shape="pill"
      onSuccess={(credential) => {
        // TEMP DEBUG — remove once sign-in is confirmed working.
        console.log("[google] credential received, origin=", window.location.origin);
        if (!credential.credential) {
          onError?.("Google didn't return a credential — try again.");
          return;
        }
        signInWithGoogle(credential.credential)
          .then(onSuccess)
          .catch((err) => {
            // TEMP DEBUG — was previously swallowed entirely.
            console.error("[google] signInWithGoogle failed:", err);
            onError?.("Sign-in failed — the backend rejected that Google token.");
          });
      }}
      onError={() => onError?.("Google sign-in failed.")}
    />
  );
}
