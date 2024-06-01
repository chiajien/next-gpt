import { Analytics } from "@vercel/analytics/react";
import {
  ClerkProvider,
  SignInButton,
  SignedIn,
  SignedOut,
  UserButton,
  RedirectToSignIn,
} from "@clerk/nextjs";
import { Home } from "./components/home";

import { getServerSideConfig } from "./config/server";
import { IconButton } from "./components/button";
import { CustomSignInButton } from "./components/signInBtn";

const serverConfig = getServerSideConfig();

export default async function App() {
  return (
    <>
      <ClerkProvider>
        <SignedOut>
          <SignInButton />
        </SignedOut>
        <SignedIn>
          <Home />
          {serverConfig?.isVercel && (
            <>
              <Analytics />
            </>
          )}
        </SignedIn>
      </ClerkProvider>
    </>
  );
}
