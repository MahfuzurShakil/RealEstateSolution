'use client';

import { useParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { ProjectForm } from '@/components/admin/projects/ProjectForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { projectRepository } from '@/lib/repositories';

export default function EditProjectPage() {
  const { id } = useParams<{ id: string }>();
  const project = useLiveQuery(() => projectRepository.getWithRelations(id), [id]);

  if (project === undefined) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (!project) return <p className="text-sm text-ink-muted">This project no longer exists.</p>;

  return (
    <>
      <PageHeader title={`Edit ${project.code}`} subtitle={project.name} />
      <ProjectForm project={project} />
    </>
  );
}
