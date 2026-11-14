// Changed in this fork (Respira with a Create screen): see "This fork" in README.md.
/**
 * FileSelector Component
 *
 * Renders file input and selection button, handles native vs web file selection
 */

import { FolderOpenIcon, CheckCircleIcon } from "@heroicons/react/24/solid";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { IFileService } from "../../platform/interfaces/IFileService";

interface FileSelectorProps {
  fileService: IFileService;
  isLoading: boolean;
  isDisabled: boolean;
  onFileChange: (event?: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  displayFileName: string;
  patternUploaded: boolean;
}

export function FileSelector({
  fileService,
  isLoading,
  isDisabled,
  onFileChange,
  patternUploaded,
}: FileSelectorProps) {
  const hasNativeDialogs = fileService.hasNativeDialogs();

  return (
    <>
      <input
        type="file"
        accept=".pes"
        onChange={onFileChange}
        id="file-input"
        className="hidden"
        disabled={isDisabled}
      />
      <Button
        asChild={!hasNativeDialogs && !isDisabled}
        onClick={hasNativeDialogs ? () => onFileChange() : undefined}
        disabled={isDisabled}
        variant="outline"
        className="flex-[2]"
      >
        {hasNativeDialogs ? (
          <>
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Loading...</span>
              </>
            ) : patternUploaded ? (
              <>
                <CheckCircleIcon className="w-3.5 h-3.5" />
                <span>Locked</span>
              </>
            ) : (
              <>
                <FolderOpenIcon className="w-3.5 h-3.5" />
                <span>Choose a .pes file</span>
              </>
            )}
          </>
        ) : (
          <label
            htmlFor="file-input"
            className="flex items-center gap-2 cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Loading...</span>
              </>
            ) : patternUploaded ? (
              <>
                <CheckCircleIcon className="w-3.5 h-3.5" />
                <span>Locked</span>
              </>
            ) : (
              <>
                <FolderOpenIcon className="w-3.5 h-3.5" />
                <span>Choose a .pes file</span>
              </>
            )}
          </label>
        )}
      </Button>
    </>
  );
}
