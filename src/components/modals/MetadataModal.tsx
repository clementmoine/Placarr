import { z } from "zod";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useState, useEffect } from "react";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { ScannerButton } from "@/components/ScannerButton";
import Image from "next/image";

import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { Loader2 } from "lucide-react";
import { MetadataWithIncludes } from "@/types/metadata";
import type { Type } from "@prisma/client";

const metadataSchema = z.object({
  name: z.string().trim().optional(),
  barcode: z.string().trim().optional(),
});

type FormValues = z.infer<typeof metadataSchema>;

interface MetadataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: ({
    name,
    barcode,
  }: {
    name: string;
    barcode: string;
  }) => Promise<void>;
  onPreview: ({
    name,
    barcode,
  }: {
    name: string;
    barcode: string;
  }) => Promise<void>;
  currentName: string;
  currentBarcode: string;
  type: Type;
  metadata: MetadataWithIncludes | null;
  isFetching: boolean;
}

export function MetadataModal({
  isOpen,
  type,
  onClose,
  onSubmit,
  onPreview,
  currentName,
  currentBarcode,
  metadata,
  isFetching,
}: MetadataModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(metadataSchema),
    defaultValues: {
      name: currentName,
      barcode: currentBarcode,
    },
  });

  useEffect(() => {
    if (isOpen) {
      onPreview({
        name: currentName,
        barcode: currentBarcode,
      });
      form.reset();
    }
  }, [currentName, currentBarcode, form, isOpen, onPreview]);

  const debounce = useDebounce(1000);

  const handleSubmit = useCallback(
    async (values: FormValues) => {
      setIsSubmitting(true);
      try {
        await onSubmit({
          name: values.name || "",
          barcode: values.barcode || "",
        });
        onClose();
      } catch (error) {
        console.error("Error submitting metadata:", error);
        toast.error("Failed to submit metadata");
      } finally {
        setIsSubmitting(false);
      }
    },
    [onSubmit, onClose],
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="flex flex-col p-0 overflow-hidden bg-background text-foreground gap-0 max-h-[90vh]">
        <DialogHeader className="p-4 border-b shrink-0">
          <DialogTitle className="text-foreground">Find Metadata</DialogTitle>
          <DialogDescription className="text-foreground">
            Search for {type} details and cover image
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="flex flex-col overflow-hidden"
          >
            <div className="overflow-x-hidden overflow-y-auto flex flex-col space-y-4 p-4 max-h-[60vh]">
              {/* Barcode */}
              <FormField
                control={form.control}
                name="barcode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground">Barcode</FormLabel>
                    <FormControl>
                      <div className="flex relative items-center">
                        <Input
                          type="text"
                          className="pr-11 bg-background text-foreground"
                          placeholder="Enter barcode"
                          {...field}
                          onChange={(e) => {
                            field.onChange(e);
                            debounce(() =>
                              onPreview({
                                name: form.watch("name") || "",
                                barcode: e.target.value,
                              }),
                            );
                          }}
                        />
                        <ScannerButton
                          className="absolute right-1 rounded-sm"
                          onScan={(barcode: string) => {
                            form.setValue("barcode", barcode);
                            onPreview({
                              name: form.watch("name") || "",
                              barcode,
                            });
                          }}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground">Name</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Enter name"
                        className="bg-background text-foreground"
                        onChange={(e) => {
                          field.onChange(e);
                          debounce(() =>
                            onPreview({
                              name: e.target.value,
                              barcode: form.watch("barcode") || "",
                            }),
                          );
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {isFetching ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="size-8 animate-spin" />
                </div>
              ) : metadata ? (
                <div className="flex flex-col gap-4 mt-4">
                  <div className="flex gap-4">
                    {metadata.imageUrl && (
                      <div className="relative">
                        <Image
                          width={500}
                          height={500}
                          src={metadata.imageUrl}
                          alt={metadata.title || "Cover"}
                          className="object-cover rounded-lg w-32 h-auto"
                        />
                      </div>
                    )}
                    <div className="flex flex-col gap-2">
                      <h3 className="text-md font-semibold">
                        {metadata.title}
                        {metadata.releaseDate && (
                          <span className="ml-2 text-muted-foreground">
                            ({new Date(metadata.releaseDate).getFullYear()})
                          </span>
                        )}
                      </h3>
                      {metadata.authors?.map((author) => (
                        <p className="text-sm" key={author.name}>
                          {author.name}
                        </p>
                      ))}
                      {metadata.publishers?.map((publisher) => (
                        <p className="text-sm" key={publisher.name}>
                          {publisher.name}
                        </p>
                      ))}
                    </div>
                  </div>
                  {metadata.description && (
                    <p className="text-sm text-muted-foreground">
                      {metadata.description}
                    </p>
                  )}
                </div>
              ) : null}
            </div>

            <DialogFooter className="p-4 border-t shrink-0">
              <Button
                type="submit"
                disabled={isSubmitting || isFetching}
                className="w-full"
              >
                {isSubmitting ? "Submitting..." : "Use this metadata"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
