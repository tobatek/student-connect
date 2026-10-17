import { Award, BadgeCheck, Trophy, type LucideIcon } from 'lucide-react';
import type { RecordKind } from '@students-connect/contracts';

export interface KindConfig {
  slug: RecordKind;
  title: string;
  singular: string;
  description: string;
  nameLabel: string;
  icon: LucideIcon;
}

export const KINDS: Record<RecordKind, KindConfig> = {
  'prestasi-mandiri': {
    slug: 'prestasi-mandiri',
    title: 'Prestasi Mandiri',
    singular: 'prestasi',
    description: 'Prestasi mahasiswa dalam lomba/kompetisi beserta mahasiswa dan dosen pendamping.',
    nameLabel: 'Nama lomba / kompetisi',
    icon: Trophy,
  },
  sertifikasi: {
    slug: 'sertifikasi',
    title: 'Sertifikasi',
    singular: 'sertifikasi',
    description: 'Sertifikasi yang diperoleh mahasiswa dari lembaga penyelenggara.',
    nameLabel: 'Nama sertifikasi',
    icon: BadgeCheck,
  },
  rekognisi: {
    slug: 'rekognisi',
    title: 'Rekognisi',
    singular: 'rekognisi',
    description: 'Pengakuan atas karya dan peran mahasiswa/dosen: publikasi, paten, juri, duta, dan sebagainya.',
    nameLabel: 'Nama kegiatan / karya',
    icon: Award,
  },
};

export const isRecordKind = (value: string | undefined): value is RecordKind => value === 'prestasi-mandiri' || value === 'sertifikasi' || value === 'rekognisi';
