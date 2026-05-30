import { CalendarIcon, TimerIcon, ShareIcon, SixDotsIcon, ArrowDownIcon, AnnouncementIcon, SongIcon, SermonIcon, CirclePlusIcon } from "../../components/icons"

const Setlists = () => {
    return (
        <>
        <div className="h-[96px] w-full flex items-center justify-between">
           <div className="w-[50%]">
             <div className="text-[12px] text-[#BFC7D3] flex flex-row items-center gap-[8px] h-full">
                <h5 className="text-[#BFC7D3]">Setlist</h5>
                <h5 className="text-[#BFC7D3]">/</h5>
                <h5 className="text-[#E5E2E1]">Sunday Morning Worship (Aug 20)</h5>
            </div>

            <h2 className="text-[#E5E2E1] text-[32px] font-semibold mt-[8px] mb-[12px]">Sunday Morning Worship (Aug 20)</h2>

            <div className="h-[24px] flex items-center gap-[16px]">
                <div className="flex gap-[6px] items-center bg-[#9BCBFF]/10 text-[#9BCBFF] h-full w-[225px] rounded-[4px]">
                    <CalendarIcon height={10} width={10} color="#9BCBFF" />
                    <h6 className="text-[12px] font-medium">Sunday, Aug 20, 2023 • 9:00 AM</h6>
                </div>

                <div className="h-[24px] bg-[#2A2A2A] w-[126px] flex items-center justify-center rounded-[4px] gap-[6px]">
                    <TimerIcon width={11} height={13} color="#BFC7D3" />
                    <h6 className="text-[12px] font-medium text-[#BFC7D3]">Est. 60:00 Total</h6>
                </div>
            </div>
           </div>

        <div className="w-[10%] h-full flex flex-col justify-end">
            <div className="h-[38px] w-[94px] rounded-[8px] border border-white/10 flex items-center justify-center bg-[#201F1F] gap-[8px] text-white/10 self-end">
                <ShareIcon width={14} height={15} color="#E5E2E1" />
                <h5 className="text-[14px] font-medium text-[#E5E2E1]">Share</h5>
            </div>
        </div>
        </div>

        {/* List of Songs or Segments */}

        <div className="mt-[32px] w-full h-[74px] flex flex-row gap-[32px]">


                     <div className="w-[60%]">
                        {[
                            {
                                type: "announcement",
                                title: "Service Intro & Announcements",
                                subtitle: "Host: Pastor David • Loop: Sunday_Welcome.mp4",
                                duration: "02:00",
                                label: "ANNOUNCEMENT"
                            },
                            {
                                type: "song",
                                title: "Opening Song",
                                subtitle: "Lead: Sarah • Key: G",
                                duration: "04:30",
                                label: "SONG"
                            },
                            {
                                type: "sermon",
                                title: "Sunday Sermon",
                                subtitle: "Speaker: Pastor Mike • Topic: Faith",
                                duration: "25:00",
                                label: "SERMON"
                            },
                            {
                                type: "scripture",
                                title: "Scripture Reading",
                                subtitle: "Reader: John • Passage: Psalm 23",
                                duration: "01:45",
                                label: "SCRIPTURE"
                            }
                        ].map((segment, idx, arr) => {
                            let IconComponent: React.FC<{ width?: number; height?: number; color?: string }> = AnnouncementIcon;
                            let bgColor = "bg-[#E9C349]/10";
                            let iconColor = "#E9C349";
                            let borderColor = "border-white/6";
                            if (segment.type === "song") {
                                IconComponent = SongIcon;
                                bgColor = "bg-[#9BCBFF]/10";
                                iconColor = "#9BCBFF";
                                borderColor = "border-[#9BCBFF]";
                            } else if (segment.type === "sermon") {
                                IconComponent = SermonIcon;
                                bgColor = "bg-[#E9C349]/10";
                                iconColor = "#E9C349";
                                borderColor = "border-[#E9C349]";
                            } else if (segment.type === "scripture") {
                                IconComponent = SongIcon;
                                bgColor = "bg-[#DDB7FF]/10";
                                iconColor = "#DDB7FF";
                                borderColor = "border-white/6";
                            }
                            return (
                                <div key={idx}>
                                    <div className={`h-[74px]${idx !== 0 ? " mt-[10px]" : ""} rounded-[12px] bg-[#121212]/70 border ${borderColor} flex gap-[16px] items-center px-[16px]`}>
                                        <SixDotsIcon />
                                        <div className={`w-[40px] h-[40px] ${bgColor} rounded-[4px] flex items-center justify-center`}>
                                            <IconComponent width={24} height={24} color={iconColor} />
                                        </div>
                                        <div className="w-[75%]">
                                            <h3 className="text-[#E5E2E1] text-[16px] font-semibold">{segment.title}</h3>
                                            <h6 className="text-[#BFC7D3] text-[12px] font-medium">{segment.subtitle}</h6>
                                        </div>
                                        <div className="w-[25%] flex flex-col items-end">
                                            <h3 className="text-[#9BCBFF] text-[14px]">{segment.duration}</h3>
                                            <h5 className="text-[#BFC7D3] text-[10px]">{segment.label}</h5>
                                        </div>
                                    </div>
                                    {idx < arr.length - 1 && (
                                        <div className="ml-[20px] mt-[4px] relative flex items-start" style={{ height: 40 }}>
                                            <div className="absolute left-[1px] -translate-x-1/2 -bottom-2 z-10 bg-transparent">
                                                <ArrowDownIcon width={20} height={20} color="#BFC7D3" />
                                            </div>
                                            <div className="border-l-2 border-l-[#BFC7D3] border-l-dashed h-[32px] w-0 mt-[8px]"></div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        <div className="w-full h-[46px] flex justify-center items-center">
                            <div className="bg-[#2A2A2A] border border-white/20 border-dashed h-full w-[192px] gap-[8px] rounded-[12px] mt-[32px] flex items-center justify-center">
                               <CirclePlusIcon />
                                <h4 className="text-[#E5E2E1] text-[14px] font-medium">Add Service Item</h4>
                            </div>
                        </div>
                     </div>

                     <div className="w-[40%]">
                <div className="p-[24px] bg-[#121212]/70 border rounded-[16px] border-white/10">
                    <h4 className="text-[12px] font-medium">Library Quick-Add</h4>

                    <div className="mt-[16px] bg-[#1C1B1B] border border-white/10 rounded-[8px] p-[12px]">
                        <h4>Grave Into Gardens</h4>
                        <h6>Elevation Worship</h6>
                    </div>

                    <div className="mt-[16px] bg-[#1C1B1B] border border-white/10 rounded-[8px] p-[12px]">
                        <h4>Grave Into Gardens</h4>
                        <h6>Elevation Worship</h6>
                    </div>

                    <div className="mt-[16px] bg-[#1C1B1B] border  border-white/10 rounded-[8px] p-[12px]">
                        <h4>Grave Into Gardens</h4>
                        <h6>Elevation Worship</h6>
                    </div>

                     <div className="h-[32px] mt-[16px] flex justify-center items-center py-[8px]">
                        <h4 className="text-[#9BCBFF] text-[12px] font-semibold">View Full Music Library</h4>
                    </div>
                </div>
               
            </div>

           </div>

        {/* Media Player */}
        <div className="absolute bottom-[24px] w-full bg-[#121212]/70 border border-white/10 h-[24px] rounded-[16px] px-[24px]">
            <div className="flex items-center justify-between mb-[16px]">
                <div className="flex items-center gap-[8px]">
                    <div className="w-[8px] h-[8px] rounded-full bg-[#E9C349]"></div>
                    <h4 className="text-[#E9C349] text-[12px] font-semibold">LIVE: PRE-SERVICE LOOP</h4>
                </div>
                <h6 className="text-[#BFC7D3] text-[12px] font-medium">02:34 / 05:00</h6>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-[4px] bg-[#2A2A2A] rounded-[2px] mb-[20px]">
                <div className="h-full w-[51%] bg-[#9BCBFF] rounded-[2px]"></div>
            </div>

            {/* Control Buttons */}
            <div className="flex items-center justify-center gap-[32px]">
                <button className="w-[40px] h-[40px] flex items-center justify-center rounded-full bg-[#2A2A2A] hover:bg-[#3A3A3A] transition-colors">
                    <svg width="13" height="12" viewBox="0 0 13 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M0 12V0H2V12H0ZM13 12L4 6L13 0V12ZM11 8.25V3.75L7.6 6L11 8.25Z" fill="#BFC7D3"/>
                    </svg>
                </button>
                <button className="w-[48px] h-[48px] flex items-center justify-center rounded-full bg-[#9BCBFF] hover:bg-[#7BB8EE] transition-colors">
                    <svg width="13" height="12" viewBox="0 0 13 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M0 0H12V12H0V0ZM3 3V9H5V3H3ZM7 3V9H9V3H7Z" fill="#121212"/>
                    </svg>
                </button>
                <button className="w-[40px] h-[40px] flex items-center justify-center rounded-full bg-[#2A2A2A] hover:bg-[#3A3A3A] transition-colors">
                    <svg width="13" height="12" viewBox="0 0 13 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M0 0H2V12H0V0ZM4 0L13 6L4 12V0ZM6 3.75V8.25L9.4 6L6 3.75Z" fill="#BFC7D3"/>
                    </svg>
                </button>
            </div>
        </div>

        </>
    );
};

export default Setlists;