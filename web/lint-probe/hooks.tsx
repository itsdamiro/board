// Faulty on purpose (ADR 007, decision 3): a hook called conditionally, and an effect that misses a dependency.
import { useEffect, useState } from "react";

export function Hooks({ flag, n }: { flag: boolean; n: number }) {
  if (flag) {
    useState(0);
  }
  useEffect(() => {
    console.log(n);
  }, []);
  return <p>{n}</p>;
}
