import clsx from 'clsx'

interface Props {
  children: React.ReactNode
  variant?: 'green' | 'yellow' | 'red' | 'blue' | 'gray'
}

const variantMap = {
  green:  'bg-green-100  text-green-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  red:    'bg-red-100    text-red-700',
  blue:   'bg-blue-100   text-blue-700',
  gray:   'bg-gray-100   text-gray-600',
}

export default function Badge({ children, variant = 'gray' }: Props) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
        variantMap[variant],
      )}
    >
      {children}
    </span>
  )
}
