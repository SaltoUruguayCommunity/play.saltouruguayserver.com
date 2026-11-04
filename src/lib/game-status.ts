export function canEditGameMetadata(status: string) {
    return status !== 'suspended';
}
