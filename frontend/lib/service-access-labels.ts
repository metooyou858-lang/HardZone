export type ServiceAccessFlags = {
  allow_free_visit: boolean;
  allow_group_training: boolean;
  allow_personal_training: boolean;
};

export type NamedTrainingType = {
  name: string;
};

export function describeServiceAccess(
  access: ServiceAccessFlags | null | undefined,
  trainingTypes: NamedTrainingType[],
  options: { lowercase?: boolean } = {}
) {
  const labels = options.lowercase
    ? {
        notConfigured: "права доступа не настроены",
        freeOnly: "свободное посещение",
        allGroupAndPersonal: "все групповые и персональные",
        allGroup: "все групповые",
        allPersonal: "все персональные",
        noAccess: "нет доступа к тренировкам",
      }
    : {
        notConfigured: "Права доступа не настроены",
        freeOnly: "Свободное посещение",
        allGroupAndPersonal: "Все групповые и персональные",
        allGroup: "Все групповые",
        allPersonal: "Все персональные",
        noAccess: "Нет доступа к тренировкам",
      };

  if (!access) {
    return labels.notConfigured;
  }

  if (trainingTypes.length > 0) {
    return trainingTypes.map((item) => item.name).join(", ");
  }

  if (access.allow_free_visit && !access.allow_group_training && !access.allow_personal_training) {
    return labels.freeOnly;
  }

  if (access.allow_group_training && access.allow_personal_training) {
    return labels.allGroupAndPersonal;
  }

  if (access.allow_group_training) {
    return labels.allGroup;
  }

  if (access.allow_personal_training) {
    return labels.allPersonal;
  }

  return labels.noAccess;
}
