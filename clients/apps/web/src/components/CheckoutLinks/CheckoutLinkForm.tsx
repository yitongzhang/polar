import {
  useDiscount,
  useDiscounts,
  useSelectedProducts,
  useUpdateCheckoutLink,
} from '@/hooks/queries'
import { setValidationErrors } from '@/utils/api/errors'
import { getDiscountDisplay } from '@/utils/discount'
import ClearOutlined from '@mui/icons-material/ClearOutlined'
import { isValidationError, schemas } from '@polar-sh/client'
import Button from '@polar-sh/ui/components/atoms/Button'
import { Combobox } from '@polar-sh/ui/components/atoms/Combobox'
import Input from '@polar-sh/ui/components/atoms/Input'
import Switch from '@polar-sh/ui/components/atoms/Switch'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@polar-sh/ui/components/ui/form'
import { XIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { SubmitHandler, useFieldArray, useForm } from 'react-hook-form'
import ProductSelect from '../Products/ProductSelect'
import { toast } from '../Toast/use-toast'
import { TrialConfigurationForm } from '../TrialConfiguration/TrialConfigurationForm'

type CheckoutLinkUpdateForm = Omit<
  schemas['CheckoutLinkUpdate'],
  'metadata'
> & {
  metadata: { key: string; value: string | number | boolean }[]
  products: string[]
}

export interface CheckoutLinkFormProps {
  organization: schemas['Organization']
  checkoutLink: schemas['CheckoutLink']
  onClose: (checkoutLink: schemas['CheckoutLink']) => void
}

export const CheckoutLinkForm = ({
  organization,
  checkoutLink,
  onClose,
}: CheckoutLinkFormProps) => {
  const [discountQuery, setDiscountQuery] = useState('')

  const { data: discounts, isLoading: isLoadingDiscounts } = useDiscounts(
    organization.id,
    {
      query: discountQuery || undefined,
      limit: 10,
      sorting: ['name'],
    },
  )

  // Since discounts is paginated & dynamically loaded above,
  // we need to fetch the selected discount separately to ensure we have its data
  const { data: selectedDiscount } = useDiscount(
    organization.id,
    checkoutLink?.discount_id,
  )

  const defaultValues = useMemo<CheckoutLinkUpdateForm>(() => {
    return {
      ...checkoutLink,
      label: checkoutLink.label ?? null,
      metadata: Object.entries(checkoutLink.metadata ?? {}).map(
        ([key, value]) => ({ key, value }),
      ),
      products: checkoutLink.products.map(({ id }) => id),
      allow_discount_codes: checkoutLink.allow_discount_codes ?? true,
      require_billing_address: checkoutLink.require_billing_address ?? false,
      success_url: checkoutLink.success_url ?? '',
      discount_id: checkoutLink.discount_id ?? '',
    }
  }, [checkoutLink])

  const form = useForm<CheckoutLinkUpdateForm>({
    defaultValues,
  })

  const { control, handleSubmit, setError, reset, watch } = form
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'metadata',
    rules: {
      maxLength: 50,
    },
  })

  // Watch for selected product IDs to determine if we should show trial configuration
  const selectedProductIds = watch('products') || []
  const { data: selectedProducts } = useSelectedProducts(selectedProductIds)

  // Check if any selected products are recurring (subscription products)
  const hasRecurringProducts = useMemo(() => {
    return selectedProducts?.some((product) => product.is_recurring) ?? false
  }, [selectedProducts])

  useEffect(() => {
    reset(defaultValues)
  }, [checkoutLink, reset, defaultValues])

  const { mutateAsync: updateCheckoutLink, isPending: isUpdatePending } =
    useUpdateCheckoutLink()

  const handleValidationError = useCallback(
    (data: CheckoutLinkUpdateForm, errors: schemas['ValidationError'][]) => {
      setValidationErrors(errors, setError, 1, [])
      errors.forEach((error) => {
        const loc = error.loc.slice(1)
        if (loc[0] === 'metadata') {
          const metadataKey = loc[1]
          const metadataIndex = data.metadata.findIndex(
            ({ key }) => key === metadataKey,
          )
          if (metadataIndex > -1) {
            const field = loc[2] === '[key]' ? 'key' : 'value'
            setError(`metadata.${metadataIndex}.${field}`, {
              message: error.msg,
            })
          }
        }
      })
    },
    [setError],
  )

  const onSubmit: SubmitHandler<CheckoutLinkUpdateForm> = useCallback(
    async (data) => {
      const body: schemas['CheckoutLinkUpdate'] = {
        ...data,
        discount_id: data.discount_id || null,
        success_url: data.success_url || null,
        metadata: data.metadata.reduce(
          (acc, { key, value }) => ({ ...acc, [key]: value }),
          {},
        ),
      }

      const { data: updatedCheckoutLink, error } = await updateCheckoutLink({
        id: checkoutLink.id,
        body,
      })
      if (error) {
        if (isValidationError(error.detail)) {
          handleValidationError(data, error.detail)
        } else {
          setError('root', { message: error.detail })
        }
        return
      }
      toast({
        title: 'Checkout Link Updated',
        description: `${
          updatedCheckoutLink.label ? updatedCheckoutLink.label : 'Unlabeled'
        } Checkout Link was updated successfully`,
      })

      onClose(updatedCheckoutLink)
    },
    [
      onClose,
      checkoutLink,
      updateCheckoutLink,
      setError,
      handleValidationError,
    ],
  )

  return (
    <>
      <Form {...form}>
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-y-6"
        >
          <FormField
            control={control}
            name="label"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Label</FormLabel>
                <FormControl>
                  <Input placeholder="" {...field} value={field.value || ''} />
                </FormControl>
                <FormDescription className="text-xs">
                  Helpful if you have multiple links - internal &amp; optional.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="products"
            rules={{
              validate: (value) =>
                value.length < 1 ? 'At least one product is required' : true,
            }}
            render={({ field }) => {
              return (
                <FormItem>
                  <FormLabel>Products</FormLabel>
                  <FormControl>
                    <ProductSelect
                      organization={organization}
                      value={field.value || []}
                      onChange={field.onChange}
                      emptyLabel="Select one or more products"
                    />
                  </FormControl>
                  <FormMessage />
                  <FormDescription>
                    The customer will be able to switch between these products
                    at checkout.
                  </FormDescription>
                </FormItem>
              )
            }}
          />
          <FormField
            control={control}
            name="success_url"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Success URL</FormLabel>
                <FormControl>
                  <Input
                    placeholder="https://example.com/success?checkout_id={CHECKOUT_ID}"
                    {...field}
                    value={field.value || ''}
                  />
                </FormControl>
                <FormDescription className="text-xs">
                  Include{' '}
                  <code>
                    {'{'}CHECKOUT_ID{'}'}
                  </code>{' '}
                  to receive the Checkout ID on success.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="discount_id"
            render={({ field }) => {
              const selectedItem =
                selectedDiscount?.id === field.value
                  ? selectedDiscount
                  : discounts?.items.find((d) => d.id === field.value)

              return (
                <FormItem>
                  <FormLabel>Preset discount</FormLabel>
                  <div className="flex flex-row items-center gap-2">
                    <Combobox
                      items={discounts?.items || []}
                      value={field.value || null}
                      selectedItem={selectedItem || null}
                      onChange={(value) => field.onChange(value || '')}
                      onQueryChange={setDiscountQuery}
                      getItemValue={(discount) => discount.id}
                      getItemLabel={(discount) => discount.name}
                      renderItem={(discount) => (
                        <>
                          {discount.name} ({getDiscountDisplay(discount)})
                        </>
                      )}
                      isLoading={isLoadingDiscounts}
                      placeholder="Select a discount"
                      searchPlaceholder="Search discounts…"
                      emptyLabel="No discounts found"
                      className="flex-1"
                    />
                    {field.value && (
                      <Button
                        size="icon"
                        variant="ghost"
                        type="button"
                        onClick={() => field.onChange(null)}
                      >
                        <XIcon className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              )
            }}
          />

          <FormField
            control={control}
            name="allow_discount_codes"
            render={({ field }) => {
              return (
                <FormItem>
                  <div className="flex flex-row items-center justify-between space-y-0 space-x-2">
                    <FormLabel>Allow discount codes</FormLabel>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </div>
                  <FormMessage />
                  <FormDescription>
                    {field.value
                      ? 'Customers will be able to apply discount codes at checkout.'
                      : "Customers won't be able to apply discount codes at checkout."}
                  </FormDescription>
                </FormItem>
              )
            }}
          />
          <FormField
            control={control}
            name="require_billing_address"
            render={({ field }) => {
              return (
                <FormItem>
                  <div className="flex flex-row items-center justify-between space-y-0 space-x-2">
                    <FormLabel>Require billing address</FormLabel>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </div>
                  <FormMessage />
                  <FormDescription>
                    {field.value
                      ? 'Customers will need to provide their full billing address at checkout.'
                      : 'Customers will just need to provide their country at checkout.'}
                  </FormDescription>
                </FormItem>
              )
            }}
          />

          {hasRecurringProducts && (
            <TrialConfigurationForm bottomText="This will override the trial configuration set on products." />
          )}

          <FormItem>
            <div className="flex flex-row items-center justify-between gap-2 py-2">
              <FormLabel>Metadata</FormLabel>
              <Button
                size="sm"
                variant="secondary"
                className="self-start"
                type="button"
                onClick={() => {
                  append({ key: '', value: '' })
                }}
              >
                Add Metadata
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              {fields.map((field, index) => (
                <div
                  key={field.id}
                  className="flex flex-row items-center gap-2"
                >
                  <FormField
                    control={control}
                    name={`metadata.${index}.key`}
                    render={({ field }) => (
                      <>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value || ''}
                            placeholder="Key"
                          />
                        </FormControl>
                        <FormMessage />
                      </>
                    )}
                  />
                  <FormField
                    control={control}
                    name={`metadata.${index}.value`}
                    render={({ field }) => (
                      <>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value.toString() || ''}
                            placeholder="Value"
                          />
                        </FormControl>
                        <FormMessage />
                      </>
                    )}
                  />
                  <Button
                    className={
                      'border-none bg-transparent text-[16px] opacity-50 transition-opacity hover:opacity-100 dark:bg-transparent'
                    }
                    size="icon"
                    variant="secondary"
                    type="button"
                    onClick={() => remove(index)}
                  >
                    <ClearOutlined fontSize="inherit" />
                  </Button>
                </div>
              ))}
            </div>
          </FormItem>

          <div className="flex flex-row gap-x-4">
            <Button
              className="self-start"
              type="submit"
              loading={isUpdatePending}
            >
              Save Link
            </Button>
          </div>
        </form>
      </Form>
    </>
  )
}
