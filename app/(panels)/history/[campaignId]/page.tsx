import Workspace from '@/components/workspace';
export default async function CampaignPage({params}:{params:Promise<{campaignId:string}>}){
 const {campaignId}=await params;
 return <Workspace campaignId={campaignId}/>;
}
