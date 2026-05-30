import { SixDotsIcon, EditIcon, AddSongIcon, SetlistIcon, SuccessCheckIcon, CalendarIcon } from "../../components/icons";

const Dashboard = () => {
        return(
             <div className="w-full">

                <section className="h-[68px] flex justify-between items-center mt-[8px]">
                    <div>
                        <h2 className="text-[32px] font-semibold text-[#E5E2E1]">Production Command</h2>
                        <h5 className="mt-[4px] text-[16px] text-[#BFC7D3]">Good morning, Media Team. All systems are standby.</h5>
                    </div>

                    <div className="flex-end">
                        <h5 className="font-bold text-[10px] text-[#BFC7D3]">CURRENT TIME</h5>
                        <h2 className="font-bold text-[24px] text-[#E5E2E1]">04:15:29 PM</h2>
                    </div>
                </section>

                {/* Main Content */}
                <section className="mt-[40px] h-[660px] flex gap-[16px]">
                    <div className="border h-full w-[65%] border-white/10 rounded-[12px] p-[32px]">
                        <div className="h-[184px] flex justify-between w-full">
                            <div className="w-[60%]">
                                <ul>
                                    <li className="text-[16px] text-[#9BCBFF]">• ACTIVE SECTION</li>
                                </ul>
                                <h2 className="mt-[8px] text-[48px] font-bold text-[#E5E2E1] leading-[56px]">SUNDAY MORNING SERVICE</h2>
                                <p className="mt-[8px] text-[16px] text-[#BFC7D3]">Full Worship Experience • Main Sanctuary</p>
                            </div>

                            <div className="h-[89px] w-[142px] rounded-[16px] border bg-[#2A2A2A] border-white/10 flex flex-col justify-center items-center">
                                    <h4 className="text-[#BFC7D3] font-bold text-[10px]">STARTS IN</h4>
                                    <h2 className="text-[#DDB7FF] font-bold text-[30px] mt-[4px]">45:00</h2>
                            </div>
                        </div>


                <div className="w-full pt-[32px]">
                    <div className="flex flex-row items-center px-[16px] gap-[16px] bg-white/5 h-[86px] rounded-[12px]">

                        <div className="bg-[#9BCBFF]/20 text-[#9BCBFF] w-[48px] h-[48px] rounded-[8px] flex justify-center items-center">
                            <h4 className="font-bold text-[16px]">01</h4>
                        </div>

                        <div className="w-[90%] h-[48px]">
                            <h2 className="font-semibold text-[24px] text-[#E5E2E1]">Way Maker</h2>
                            <h4 className="text-[14px] text-[#BFC7D3]">Key: E • 68 BPM • 4/4 Time</h4>
                        </div>

                        <div>
                            <SixDotsIcon />
                        </div>
                    </div>

                    <div className="flex flex-row items-center px-[16px] mt-[16px] gap-[16px] bg-white/5 h-[86px] rounded-[12px]">

                        <div className="bg-[#DDB7FF]/20 text-[#DDB7FF] w-[48px] h-[48px] rounded-[8px] flex justify-center items-center">
                            <h4 className="font-bold text-[16px]">02</h4>
                        </div>

                        <div className="w-[90%] h-[48px]">
                            <h2 className="font-semibold text-[24px] text-[#E5E2E1]">Way Maker</h2>
                            <h4 className="text-[14px] text-[#BFC7D3]">Key: E • 68 BPM • 4/4 Time</h4>
                        </div>

                        <div>
                            <SixDotsIcon />
                        </div>
                    </div>

                     <div className="flex flex-row items-center px-[16px] mt-[16px] gap-[16px] bg-white/5 h-[86px] rounded-[12px]">

                        <div className="bg-[#353534]/20 text-[#BFC7D3] w-[48px] h-[48px] rounded-[8px] flex justify-center items-center">
                            <h4 className="font-bold text-[16px]">03</h4>
                        </div>

                        <div className="w-[90%] h-[48px]">
                            <h2 className="font-semibold text-[24px] text-[#E5E2E1]">Way Maker</h2>
                            <h4 className="text-[14px] text-[#BFC7D3]">Key: E • 68 BPM • 4/4 Time</h4>
                        </div>

                        <div>
                            <SixDotsIcon />
                        </div>
                    </div>

                    <div className="w-full h-[88px] pt-[32px] flex gap-[16px]">
                        <div className="h-[56px] bg-[#9BCBFF] flex items-center justify-center rounded-[12px] gap-[8px] w-[90%]">
                            <h3 className="text-[#003256] font-bold text-[16px] ">Go Live Now</h3>
                        </div>

                         <div className="h-[56px] border border-white/10 rounded-[12px] w-[10%] flex justify-center items-center">
                            <EditIcon />
                        </div>
                    </div>

                    
                </div>
                    </div>
                    <div className="border h-full w-[35%] border-white/10 rounded-[12px] p-[32px]">
                        <div className="p-[24px] bg-[#121212]/70 border border-white/8 rounded-[12px] h-[188px] w-full">
                            <h4 className="text-[#BFC7D3] text-[16px]">Quick Actions</h4>

                            <div className="flex gap-[12px] h-[98px] mt-[16px]">
                                <div className="h-full w-[50%] bg-[#2A2A2A] border border-white/5 rounded-[12px] flex flex-col items-center justify-center">
                                    <div className="h-[40px] w-[40px] bg-[#9BCBFF]/10 rounded-full flex items-center justify-center">
                                    <AddSongIcon />
                                    </div>
                                    <h4 className="font-semibold text-[12px]">Add New Song</h4>
                                </div>
                                  <div className="h-full w-[50%] bg-[#2A2A2A] border border-white/5 rounded-[12px] flex flex-col items-center justify-center">
                                    <div className="h-[40px] w-[40px] bg-[#DDB7FF]/10 rounded-full flex items-center justify-center">
                                    <SetlistIcon />
                                    </div>
                                    <h4 className="font-semibold text-[12px]">Create Setlist</h4>
                                </div>
                            </div>

                    

                        </div>

                        <div className="h-[98px] mt-[16px] w-full px-[24px] flex items-center gap-[16px] bg-[121212]/70 border border-white/8 rounded-[12px]">
                            <div className="h-[48px] w-[48px] rounded-[12px] bg-[#22C55E]/10 text-[#22C55E] flex justify-center items-center">
                                <SuccessCheckIcon />
                            </div>

                            <div>
                                <h3 className="text-[#E5E2E1] font-bold text-[14px]">Sync Status</h3>
                                <p className="text-[12px] text-[#BFC7D3]">All changes synced to cloud</p>
                            </div>
                        </div>

                        <div className="mt-[16px] h-[105px] flex gap-[16px]">

                            <div className="w-[50%] h-full border bg-[#121212]/70 border border-white/10 rounded-[12px] flex flex-col justify-center items-center">
                                <h3 className="text-[#9BCBFF] text-[30px] font-bold">248</h3>
                                <h5 className="text-[#BFC7D3] font-bold text-[10px]">LIBRARY SONGS</h5>
                            </div>

                             <div className="w-[50%] h-full border bg-[#121212]/70 border border-white/10 rounded-[12px] flex flex-col justify-center items-center">
                                <h3 className="text-[#DDB7FF] text-[30px] font-bold">12</h3>
                                <h5 className="text-[#BFC7D3] font-bold text-[10px]">PRESENTATIONS</h5>
                            </div>

                        </div>

                        <div className="mt-[16px] w-full h-[155px] bg-[#121212] border border-white/8 rounded-[12px] flex-end p-[24px] relative">
                            <div className="absolute bottom-[24px] left-[24px]">
                                <h3 className="text-[10px] font-bold text-[#9BCBFF]">STAGE ENVIRONMENT</h3>
                                <h2 className="text-[#E5E2E1] text-[18px]">Default Visualizer: Active</h2>
                            </div>
                        </div>
                    </div>

                </section>

                <section className="h-[188px] mb-[48px] p-[24px] bg-[#121212] rounded-[12px] border border-white/8 mt-[16px]">
                    <div className="flex justify-between items-center">
                        <h2 className="text-[#E5E2E1] font-semibold text-[24px]">Recent Presentation</h2>
                        <h4 className="text-[#9BCBFF] font-semibold text-[14px]">View All History</h4>
                    </div>

                    <div className="mt-[24px] flex gap-[16px]">
                        <div className="bg-[#1C1B1B] border border-white/5 rounded-[12px] w-[25%] h-[82px] px-[16px] flex items-center gap-[16px]">
                            <div className="h-[48px] w-[48px] rounded-[12px] bg-white/5 border border-white/5 flex items-center justify-center">
                                <CalendarIcon />
                            </div>
                            <div>
                                <h4 className="text-[14px] font-bold text-[#E5E2E1]">Youth Night Session</h4>
                                <p className="text-[#BFC7D3] text-[12px]">Last Wednesday • 4 Songs</p>
                            </div>
                        </div>
                        <div className="bg-[#1C1B1B] border border-white/5 rounded-[12px] w-[25%] h-[82px] px-[16px] flex items-center gap-[16px]">
                            <div className="h-[48px] w-[48px] rounded-[12px] bg-white/5 border border-white/5 flex items-center justify-center">
                                <CalendarIcon />
                            </div>
                            <div>
                                <h4 className="text-[14px] font-bold text-[#E5E2E1]">Youth Night Session</h4>
                                <p className="text-[#BFC7D3] text-[12px]">Last Wednesday • 4 Songs</p>
                            </div>
                        </div>
                        <div className="bg-[#1C1B1B] border border-white/5 rounded-[12px] w-[25%] h-[82px] px-[16px] flex items-center gap-[16px]">
                            <div className="h-[48px] w-[48px] rounded-[12px] bg-white/5 border border-white/5 flex items-center justify-center">
                                <CalendarIcon />
                            </div>
                            <div>
                                <h4 className="text-[14px] font-bold text-[#E5E2E1]">Youth Night Session</h4>
                                <p className="text-[#BFC7D3] text-[12px]">Last Wednesday • 4 Songs</p>
                            </div>
                        </div>
                        <div className="bg-[#1C1B1B] border border-white/5 rounded-[12px] w-[25%] h-[82px] px-[16px] flex items-center gap-[16px]">
                            <div className="h-[48px] w-[48px] rounded-[12px] bg-white/5 border border-white/5 flex items-center justify-center">
                                <CalendarIcon />
                            </div>
                            <div>
                                <h4 className="text-[14px] font-bold text-[#E5E2E1]">Youth Night Session</h4>
                                <p className="text-[#BFC7D3] text-[12px]">Last Wednesday • 4 Songs</p>
                            </div>
                        </div>
                    </div>
                </section>

             </div>
        )
}

export default Dashboard;