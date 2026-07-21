"use client";

import { MouseEvent, ReactNode } from "react";
import clsx from "clsx";

interface ModalProps {
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

export function Modal({ onClose, children, className }: ModalProps) {
  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay-backdrop animate-fade-in"
      onClick={handleBackdropClick}
    >
      <div
        className={clsx(
          "w-full rounded-16 bg-surface-card shadow-modal animate-pop-in",
          className
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
