import { useState } from "react";
import { useMachineStore } from "../stores/useMachineStore";
import { isBluetoothSupported } from "../utils/bluetoothSupport";
import { Button } from "../components/ui/button";
export function ConnectionBar({ onStitch }: { onStitch: () => void }) {
  const connected = useMachineStore((s) => s.isConnected);
  const connect = useMachineStore((s) => s.connect);
  const [connecting, setConnecting] = useState(false);
  return (
    <div className="flex flex-wrap gap-2 items-center justify-between px-4 py-2 bg-white dark:bg-gray-800 border-b text-sm">
      <span>
        {connected
          ? "Machine connected"
          : isBluetoothSupported()
            ? "Create and preview offline · connect when ready"
            : "This browser can create and preview designs, but cannot connect with Bluetooth."}
      </span>
      {connected ? (
        <Button size="sm" variant="outline" onClick={onStitch}>
          Machine controls
        </Button>
      ) : isBluetoothSupported() ? (
        <Button
          size="sm"
          disabled={connecting}
          onClick={async () => {
            setConnecting(true);
            try {
              await connect();
            } finally {
              setConnecting(false);
            }
          }}
        >
          {connecting ? "Connecting…" : "Connect to Machine"}
        </Button>
      ) : (
        <a
          href="https://apps.apple.com/app/id1492822055"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          On iPad, try Bluefy
        </a>
      )}
    </div>
  );
}
