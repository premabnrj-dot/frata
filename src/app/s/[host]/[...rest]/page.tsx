import { notFound } from 'next/navigation'

// Any other path on a shop: the shop's own 404 (not Frrata's).
export const generateStaticParams = () => []
export default function Rest() { notFound() }
