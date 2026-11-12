import { useState } from "react";
import { useMachineStore } from "../stores/useMachineStore";
import { isBluetoothSupported } from "../utils/bluetoothSupport";
import { Button } from "../components/ui/button";

/**
 * Connection status and the Connect button, sized to sit at the end of the screen tabs.
 * It used to be a bar of its own under the header; on an iPad in landscape that bar took
 * height the real-size hoop needs.
 */
export function ConnectionBar({
  statusOnly = false,
}: {
  statusOnly?: boolean;
}) {
  const connected = useMachineStore((s) => s.isConnected);
  const connect = useMachineStore((s) => s.connect);
  const [connecting, setConnecting] = useState(false);

  if (connected) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
        <span
          className="w-2 h-2 rounded-full bg-success-500"
          aria-hidden="true"
        />
        Machine connected
      </span>
    );
  }

  if (statusOnly)
    return (
      <span className="text-sm text-gray-600 dark:text-gray-300">
        Not connected
      </span>
    );

  if (!isBluetoothSupported()) {
    return (
      <span className="block max-w-[17rem] text-xs leading-snug text-right text-gray-600 dark:text-gray-400">
        This browser can create and preview designs, but cannot connect with
        Bluetooth.{" "}
        <a
          href="https://apps.apple.com/app/id1492822055"
          target="_blank"
          rel="noreferrer"
          className="underline whitespace-nowrap"
        >
          On iPad, try Bluefy
        </a>
      </span>
    );
  }

  return (
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
  );
}
