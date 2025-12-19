import { getServerSideAPI } from '@/utils/client/serverside'
import { getLastVisitedOrg } from '@/utils/cookies'
import { getUserOrganizations } from '@/utils/user'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function Page() {
  const api = await getServerSideAPI()
  const userOrganizations = await getUserOrganizations(api, true)

  if (userOrganizations.length === 0) {
    // No organizations - show an empty state
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-gray-500">No organizations found.</p>
      </div>
    )
  }

  const lastVisitedOrg = getLastVisitedOrg(await cookies(), userOrganizations)
  const organization = lastVisitedOrg ? lastVisitedOrg : userOrganizations[0]
  redirect(`/dashboard/${organization.slug}`)
}
