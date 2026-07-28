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
        if (!credential.credential) {
          onError?.("Google didn't return a credential — try again.");
          return;
        }
        signInWithGoogle(credential.credential)
          .then(onSuccess)
          .catch(() => onError?.("Sign-in failed — the backend rejected that Google token."));
      }}
      onError={() => onError?.("Google sign-in failed.")}
    />
  );
}
