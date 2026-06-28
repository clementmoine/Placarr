"use client";

import { useEffect, useState } from "react";

type CameraAvailability = "checking" | "available" | "unavailable";

const CAMERA_UNAVAILABLE_EVENT = "placarr:camera-unavailable";
const CAMERA_UNAVAILABLE_STORAGE_KEY = "placarr.cameraUnavailable";

type CameraFeaturePolicy = {
  allowsFeature?: (feature: string) => boolean;
};

function isCameraBlockedByPolicy() {
  if (typeof document === "undefined") return false;

  const policyDocument = document as Document & {
    permissionsPolicy?: CameraFeaturePolicy;
    featurePolicy?: CameraFeaturePolicy;
  };
  const policy =
    policyDocument.permissionsPolicy ?? policyDocument.featurePolicy;

  try {
    return policy?.allowsFeature?.("camera") === false;
  } catch {
    return false;
  }
}

export function markCameraUnavailable() {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(CAMERA_UNAVAILABLE_STORAGE_KEY, "1");
  } catch {
    // Storage can be unavailable in hardened browser contexts.
  }

  window.dispatchEvent(new Event(CAMERA_UNAVAILABLE_EVENT));
}

export function useCameraAvailability() {
  const [availability, setAvailability] =
    useState<CameraAvailability>("checking");

  useEffect(() => {
    let isMounted = true;

    const handleCameraUnavailable = () => {
      if (isMounted) setAvailability("unavailable");
    };

    window.addEventListener(CAMERA_UNAVAILABLE_EVENT, handleCameraUnavailable);

    async function checkCameraAvailability() {
      const nav = typeof window === "undefined" ? null : window.navigator;

      try {
        if (
          window.sessionStorage.getItem(CAMERA_UNAVAILABLE_STORAGE_KEY) === "1"
        ) {
          if (isMounted) setAvailability("unavailable");
          return;
        }
      } catch {
        // Ignore unavailable storage and continue probing browser capabilities.
      }

      if (
        typeof window === "undefined" ||
        !nav ||
        !window.isSecureContext ||
        isCameraBlockedByPolicy() ||
        !nav.mediaDevices?.getUserMedia
      ) {
        if (isMounted) setAvailability("unavailable");
        return;
      }

      try {
        if (nav.permissions?.query) {
          try {
            const permission = await nav.permissions.query({
              name: "camera" as PermissionName,
            });
            if (permission.state === "denied") {
              if (isMounted) setAvailability("unavailable");
              return;
            }
          } catch {
            // Permissions API support is uneven; device enumeration below still helps.
          }
        }

        const devices = await nav.mediaDevices.enumerateDevices();
        const hasVideoInput = devices.some(
          (device) => device.kind === "videoinput",
        );
        if (isMounted) {
          setAvailability(hasVideoInput ? "available" : "unavailable");
        }
      } catch {
        // If enumeration is blocked but getUserMedia exists, let the scanner
        // attempt the permission flow instead of hiding camera controls.
        if (isMounted) setAvailability("available");
      }
    }

    void checkCameraAvailability();

    return () => {
      isMounted = false;
      window.removeEventListener(
        CAMERA_UNAVAILABLE_EVENT,
        handleCameraUnavailable,
      );
    };
  }, []);

  return {
    availability,
    hasCamera: availability === "available",
    isCheckingCamera: availability === "checking",
    isCameraUnavailable: availability === "unavailable",
  };
}
