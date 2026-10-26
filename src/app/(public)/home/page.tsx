import { redirect } from 'next/navigation';

/** The public home moved to `/` (master plan §4); old `/home` links keep working. */
export default function OldHomeRedirect() {
  redirect('/');
}
