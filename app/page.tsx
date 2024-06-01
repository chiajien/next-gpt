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

const serverConfig = getServerSideConfig();

export default async function App() {
  const buttonStyle: any = {
    padding: "30px 30px",
    border: "none",
    borderRadius: "40px",
    fontSize: "20px",
    fontWeight: "bold",
    textTransform: "uppercase",
    cursor: "pointer",
    transition: "all 0.3s ease-in-out",
    boxShadow: "0 6px 20px rgba(0, 0, 0, 0.2)",
    display: "inline-block",
    background: "linear-gradient(90deg, #FFA07A, #87CEEB)",
  };

  return (
    <>
      <ClerkProvider>
        <SignedOut>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              minHeight: "100vh",
              flexDirection: "column",
              fontFamily: "Arial, sans-serif",
            }}
          >
            <h1
              style={{ fontSize: "80px", marginBottom: "50px", color: "#333" }}
            >
              Welcome to Techy GPT
            </h1>
            <SignInButton>
              <button style={buttonStyle}>Click Me To Sign In</button>
            </SignInButton>
          </div>
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
