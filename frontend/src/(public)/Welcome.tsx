import { MinistryCastIcon, BuildingIcon, UpArrowIcon, GoogleIcon, VideoIcon, BroadcastIcon, CollaborationIcon, CloudSyncIcon } from "../components/icons";
import welcomeImage from "../assets/images/welcome-image.png";
import { useNavigate } from "react-router-dom";

const WelcomePage = () => {
    const navigate = useNavigate();

    const handleGetStarted = () => {
        navigate("/dashboard");
    };

    return(
        <div className="bg-[#0B0B14] flex justify-center items-center h-screen w-screen px-[32px] py-[37px]">
            <div className="bg-[#13131B] w-[1214px] h-full rounded-[12px]">
            
                <div className="h-[40px]  border border-white/20 rounded-t-[12px] flex justify-center items-center">
                    <h5 className="text-white/40 font-semibold text-[10px]">MINISTRYCAST — PRODUCTION ENGINE V1.0</h5>
                </div>

                <div className="h-[90.5%] flex flex-row border border-white/20">
                    <div className="h-full w-full border-r border-white/20 p-[64px]">
                    <MinistryCastIcon />

                    <h5 className="bg-[#4FACFE]/10 font-bold text-[10px] text-[#4FACFE] w-[142px] text-center rounded-full mt-[21px]">NEXT-GEN WORSHIP</h5>

                    <h2 className="text-[48px] mt-[46px] text-[#E2E8F0] w-[479px] font-bold leading-[48px]">Welcome to the MinistryCast Suite</h2>

                    <div className="h-[84px]">
                        <p className="mt-[24px] w-[425px] text-white/60">Elevate your spiritual experience with cinematic
                            presentation technology. Built for modern worship
                            environments.</p>
                    </div>

                    <div className="mt-[24px] h-[235px] w-[448px] border border-white/10 bg-[#191922] rounded-[8px] p-[32px]">
                    <h5 className="text-white/40 font-bold text-[12px]">CONNECT YOUR MINISTRY</h5>

                    <div className="bg-white/10 flex items-center h-[57px]  mt-[24px] pl-[16px] border border-white/10 rounded-[8px]">
                    <BuildingIcon />
                    <input className="text-white/20 bg-transparent text-[16px]"
                    placeholder="Enter Church Name" />
                    </div>


                    <div className="mt-[16px] flex flex-row items-center gap-[12px]">
                        <button
                            className="w-[308px] h-[65px] bg-[#4F46E5] rounded-[8px] flex items-center justify-center gap-[8px] focus:outline-none"
                            onClick={handleGetStarted}
                        >
                            <UpArrowIcon />
                            <h5 className="text-white font-semibold text-[16px]">Get Started</h5>
                        </button>
                        <div className="w-[62px] h-[65px] bg-white/10 border border-white/10 rounded-[8px] flex items-center justify-center">
                            <GoogleIcon />
                        </div>
                    </div>

                    </div>
                    </div>


                    <div className="h-full w-full border-l border-white/20 p-[64px]">

                        <div className="bg-[#191922]/20 h-[224px] rounded-[12px] p-[32px]">
                            <div className="w-[48px] h-[48px] bg-[#818CF8]/20 rounded-[8px] flex items-center justify-center">
                                <VideoIcon />
                            </div>

                            <h4 className="text-[20px] font-bold mt-[24px] text-[#E2E8F0]">Cinematic Engine</h4>
                            <p className="mt-[11px] text-[14px] text-white/50 leading-[23px]">Adaptive lyric rendering with AI-enhanced background selection
                                and smooth 60fps transitions.</p>
                        </div>

                         <div className="bg-[#191922]/20 h-[224px] rounded-[12px] mt-[24px] p-[32px]">
                            <div className="w-[48px] h-[48px] bg-[#F472B6]/20 rounded-[8px] flex items-center justify-center">
                                <BroadcastIcon />
                            </div>

                            <h4 className="text-[20px] font-bold mt-[24px] text-[#F472B6]">Broadcast Layers</h4>
                            <p className="mt-[11px] text-[14px] text-white/50 leading-[23px]">Separate outputs for stage monitors, live streams, and main
                            projectors with independent control.</p>
                        </div>

                        <div className="mt-[24px] flex flex-row gap-[16px] h-[64px]">

                            <div className="bg-[#6366F1]/20 rounded-[12px] flex-1 flex items-center gap-[12px] p-[16px]">
                                <div className="w-[24px] h-[24px] rounded-[8px] flex items-center ">
                                    <CloudSyncIcon />
                                </div>
                                <h5 className="text-[14px] font-medium text-[#E2E8F0]">Cloud Sync</h5>
                            </div>
                            <div className="bg-[#6366F1]/20 rounded-[12px] flex-1 flex items-center  gap-[12px] p-[16px]">
                                <div className="w-[24px] h-[24px]  rounded-[8px] flex items-center ">
                                    <CollaborationIcon />
                                </div>
                                <h5 className="text-[14px] font-medium text-[#E2E8F0]">Collaboration</h5>
                            </div>

                        </div>

                        <div className="mt-[69px]">
                            <img src={welcomeImage} alt="Welcome" className="w-full h-[128px] object-cover rounded-[12px]" />
                        </div>

                    </div>
                
                
                </div>

                <div className="h-[40px]  border border-white/20 rounded-b-[12px] flex justify-center items-center">
                    <h5 className="text-white/40 font-semibold text-[10px]">MINISTRYCAST — PRODUCTION ENGINE V1.0</h5>
                </div>

            </div>
        </div>
    )
}

export default WelcomePage;