import { SignInButton } from "@clerk/nextjs";
import styles from "./SignInButton.module.css";

export function CustomSignInButton() {
  return (
    <div style={{ paddingTop: "20px" }}>
      <SignInButton />
    </div>
  );
}
