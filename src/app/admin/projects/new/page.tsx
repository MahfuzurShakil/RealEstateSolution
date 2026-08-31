'use client';

import { ProjectForm } from '@/components/admin/projects/ProjectForm';
import { PageHeader } from '@/components/ui/PageHeader';

export default function NewProjectPage() {
  return (
    <>
      <PageHeader
        title="Add Project"
        subtitle="A project code (PRJ-YYYY-NNN) is assigned automatically on save."
      />
      <ProjectForm />
    </>
  );
}
