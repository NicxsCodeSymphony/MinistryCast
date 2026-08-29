import type { ReactNode } from "react";
import {
  BroadcastIcon,
  CloudSyncIcon,
  CollaborationIcon,
  VideoIcon,
} from "../components/icons";
import churchInterior from "../assets/images/church-interior.png";

type AuthFrameProps = {
  children: ReactNode;
};

export default function AuthFrame({ children }: AuthFrameProps) {
  return (
    <div className="bg-[#0B0B14] flex justify-center items-stretch min-h-full w-full px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-9">
      <div className="bg-[#13131B] w-full max-w-[1214px] min-h-[calc(100vh-2rem)] sm:min-h-[calc(100vh-3rem)] lg:min-h-[calc(100vh-4.5rem)] rounded-[12px] flex flex-col">
        <div className="h-10 shrink-0 border border-white/20 rounded-t-[12px] flex justify-center items-center px-3">
          <h5 className="text-white/40 font-semibold text-[10px] text-center tracking-wide">
            MINISTRYCAST — PRODUCTION ENGINE V1.0
          </h5>
        </div>

        <div className="flex-1 flex flex-col xl:flex-row border border-white/20 border-t-0 min-h-0">
          <div className="flex-1 border-b xl:border-b-0 xl:border-r border-white/20 p-6 sm:p-10 lg:p-12 xl:p-16">
            {children}
          </div>

          <div className="flex-1 border-t xl:border-t-0 xl:border-l border-white/20 p-6 sm:p-10 lg:p-12 xl:p-16">
            <div className="bg-[#191922]/20 rounded-[12px] p-6 sm:p-8">
              <div className="w-12 h-12 bg-[#818CF8]/20 rounded-[8px] flex items-center justify-center">
                <VideoIcon />
              </div>
              <h4 className="text-[clamp(1.125rem,2vw,1.25rem)] font-bold mt-6 text-[#E2E8F0]">
                Cinematic Engine
              </h4>
              <p className="mt-3 text-[14px] text-white/50 leading-[23px]">
                Adaptive lyric rendering with AI-enhanced background selection
                and smooth 60fps transitions.
              </p>
            </div>

            <div className="bg-[#191922]/20 rounded-[12px] mt-6 p-6 sm:p-8">
              <div className="w-12 h-12 bg-[#F472B6]/20 rounded-[8px] flex items-center justify-center">
                <BroadcastIcon />
              </div>
              <h4 className="text-[clamp(1.125rem,2vw,1.25rem)] font-bold mt-6 text-[#F472B6]">
                Broadcast Layers
              </h4>
              <p className="mt-3 text-[14px] text-white/50 leading-[23px]">
                Separate outputs for stage monitors, live streams, and main
                projectors with independent control.
              </p>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row gap-4">
              <div className="bg-[#6366F1]/20 rounded-[12px] flex-1 flex items-center gap-3 p-4 min-h-16">
                <div className="w-6 h-6 rounded-[8px] flex items-center shrink-0">
                  <CloudSyncIcon />
                </div>
                <h5 className="text-[14px] font-medium text-[#E2E8F0]">
                  Cloud Sync
                </h5>
              </div>
              <div className="bg-[#6366F1]/20 rounded-[12px] flex-1 flex items-center gap-3 p-4 min-h-16">
                <div className="w-6 h-6 rounded-[8px] flex items-center shrink-0">
                  <CollaborationIcon />
                </div>
                <h5 className="text-[14px] font-medium text-[#E2E8F0]">
                  Collaboration
                </h5>
              </div>
            </div>

            <div className="mt-8 xl:mt-10">
              <img
                src={churchInterior}
                alt="Sanctuary"
                className="w-full h-40 sm:h-56 lg:h-64 object-cover rounded-[12px] border border-white/10"
              />
            </div>
          </div>
        </div>

        <div className="h-10 shrink-0 border border-white/20 border-t-0 rounded-b-[12px] flex justify-center items-center px-3">
          <h5 className="text-white/40 font-semibold text-[10px] text-center tracking-wide">
            MINISTRYCAST — PRODUCTION ENGINE V1.0
          </h5>
        </div>
      </div>
    </div>
  );
}

export const AUTH_EMAIL_KEY = "mc_auth_email";

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
