import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "@/lib/auth";

export function GoogleLoginButton({ onSuccess }: { onSuccess?: () => void }) {
  const { signInWithGoogle } = useAuth();

  return (
    <GoogleLogin
      theme="filled_black"
      shape="pill"
      onSuccess={(credential) => {
        if (!credential.credential) return;
        void signInWithGoogle(credential.credential).then(onSuccess);
      }}
      onError={() => console.error("Google sign-in failed")}
    />
  );
}
