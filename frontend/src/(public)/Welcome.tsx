import { MinistryCastIcon, BuildingIcon, UpArrowIcon, GoogleIcon, VideoIcon, BroadcastIcon, CollaborationIcon, CloudSyncIcon } from "../components/icons";
import welcomeImage from "../assets/images/welcome-image.png";
import { useNavigate } from "react-router-dom";

const WelcomePage = () => {
    const navigate = useNavigate();

    const handleGetStarted = () => {
        navigate("/dashboard");
    };

    return(
        <div className="bg-[#0B0B14] flex justify-center items-stretch min-h-full w-full px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-9">
            <div className="bg-[#13131B] w-full max-w-[1214px] min-h-[calc(100vh-2rem)] sm:min-h-[calc(100vh-3rem)] lg:min-h-[calc(100vh-4.5rem)] rounded-[12px] flex flex-col">
            
                <div className="h-10 shrink-0 border border-white/20 rounded-t-[12px] flex justify-center items-center px-3">
                    <h5 className="text-white/40 font-semibold text-[10px] text-center tracking-wide">MINISTRYCAST — PRODUCTION ENGINE V1.0</h5>
                </div>

                <div className="flex-1 flex flex-col xl:flex-row border border-white/20 border-t-0 min-h-0">
                    <div className="flex-1 border-b xl:border-b-0 xl:border-r border-white/20 p-6 sm:p-10 lg:p-12 xl:p-16">
                    <MinistryCastIcon />

                    <h5 className="bg-[#4FACFE]/10 font-bold text-[10px] text-[#4FACFE] w-fit px-3 text-center rounded-full mt-5">NEXT-GEN WORSHIP</h5>

                    <h2 className="text-[clamp(1.75rem,4vw,3rem)] mt-8 xl:mt-11 text-[#E2E8F0] max-w-[479px] font-bold leading-tight">Welcome to the MinistryCast Suite</h2>

                    <div className="max-w-[425px]">
                        <p className="mt-6 text-white/60 text-[clamp(0.875rem,1.5vw,1rem)] leading-relaxed">Elevate your spiritual experience with cinematic
                            presentation technology. Built for modern worship
                            environments.</p>
                    </div>

                    <div className="mt-6 w-full max-w-[448px] border border-white/10 bg-[#191922] rounded-[8px] p-5 sm:p-8">
                    <h5 className="text-white/40 font-bold text-[12px]">CONNECT YOUR MINISTRY</h5>

                    <div className="bg-white/10 flex items-center min-h-[57px] mt-6 pl-4 border border-white/10 rounded-[8px]">
                    <BuildingIcon />
                    <input className="text-white/20 bg-transparent text-[16px] w-full min-w-0 outline-none"
                    placeholder="Enter Church Name" />
                    </div>


                    <div className="mt-4 flex flex-row items-center gap-3">
                        <button
                            className="flex-1 min-h-[56px] sm:min-h-[65px] bg-[#4F46E5] rounded-[8px] flex items-center justify-center gap-2 focus:outline-none"
                            onClick={handleGetStarted}
                        >
                            <UpArrowIcon />
                            <h5 className="text-white font-semibold text-[16px]">Get Started</h5>
                        </button>
                        <div className="w-[56px] sm:w-[62px] h-[56px] sm:h-[65px] shrink-0 bg-white/10 border border-white/10 rounded-[8px] flex items-center justify-center">
                            <GoogleIcon />
                        </div>
                    </div>

                    </div>
                    </div>


                    <div className="flex-1 border-t xl:border-t-0 xl:border-l border-white/20 p-6 sm:p-10 lg:p-12 xl:p-16">

                        <div className="bg-[#191922]/20 rounded-[12px] p-6 sm:p-8">
                            <div className="w-12 h-12 bg-[#818CF8]/20 rounded-[8px] flex items-center justify-center">
                                <VideoIcon />
                            </div>

                            <h4 className="text-[clamp(1.125rem,2vw,1.25rem)] font-bold mt-6 text-[#E2E8F0]">Cinematic Engine</h4>
                            <p className="mt-3 text-[14px] text-white/50 leading-[23px]">Adaptive lyric rendering with AI-enhanced background selection
                                and smooth 60fps transitions.</p>
                        </div>

                         <div className="bg-[#191922]/20 rounded-[12px] mt-6 p-6 sm:p-8">
                            <div className="w-12 h-12 bg-[#F472B6]/20 rounded-[8px] flex items-center justify-center">
                                <BroadcastIcon />
                            </div>

                            <h4 className="text-[clamp(1.125rem,2vw,1.25rem)] font-bold mt-6 text-[#F472B6]">Broadcast Layers</h4>
                            <p className="mt-3 text-[14px] text-white/50 leading-[23px]">Separate outputs for stage monitors, live streams, and main
                            projectors with independent control.</p>
                        </div>

                        <div className="mt-6 flex flex-col sm:flex-row gap-4">

                            <div className="bg-[#6366F1]/20 rounded-[12px] flex-1 flex items-center gap-3 p-4 min-h-16">
                                <div className="w-6 h-6 rounded-[8px] flex items-center shrink-0">
                                    <CloudSyncIcon />
                                </div>
                                <h5 className="text-[14px] font-medium text-[#E2E8F0]">Cloud Sync</h5>
                            </div>
                            <div className="bg-[#6366F1]/20 rounded-[12px] flex-1 flex items-center gap-3 p-4 min-h-16">
                                <div className="w-6 h-6 rounded-[8px] flex items-center shrink-0">
                                    <CollaborationIcon />
                                </div>
                                <h5 className="text-[14px] font-medium text-[#E2E8F0]">Collaboration</h5>
                            </div>

                        </div>

                        <div className="mt-8 xl:mt-16">
                            <img src={welcomeImage} alt="Welcome" className="w-full h-28 sm:h-32 object-cover rounded-[12px]" />
                        </div>

                    </div>
                
                
                </div>

                <div className="h-10 shrink-0 border border-white/20 border-t-0 rounded-b-[12px] flex justify-center items-center px-3">
                    <h5 className="text-white/40 font-semibold text-[10px] text-center tracking-wide">MINISTRYCAST — PRODUCTION ENGINE V1.0</h5>
                </div>

            </div>
        </div>
    )
}

export default WelcomePage;
